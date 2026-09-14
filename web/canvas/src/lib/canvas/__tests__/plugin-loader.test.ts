import { beforeEach, describe, expect, it, vi } from "vitest";

const hostBridge = vi.hoisted(() => ({
    isEmbedded: vi.fn(() => false),
    lockedApiBaseUrl: vi.fn(() => (typeof window === "undefined" ? "" : window.location.origin)),
}));

const pluginStore = vi.hoisted(() => ({
    plugins: [] as Array<{ id: string }>,
    upsert: vi.fn(),
    setEnabled: vi.fn(),
    remove: vi.fn(),
}));

const nodeRegistry = vi.hoisted(() => ({
    registerNodeDefinitions: vi.fn(),
    unregisterPluginNodes: vi.fn(),
}));

vi.mock("@/lib/host-bridge", () => hostBridge);
vi.mock("@/lib/canvas/node-registry", () => nodeRegistry);
vi.mock("@/lib/canvas/plugin-runtime", () => ({
    getPluginRuntime: vi.fn(() => ({ injectCSS: vi.fn(() => vi.fn()) })),
}));
vi.mock("@/stores/canvas/use-plugin-store", () => ({
    usePluginStore: {
        getState: () => pluginStore,
        persist: { rehydrate: vi.fn() },
    },
}));

import { assertPluginSourceAllowed, canLoadInstalledPlugin, isBundledPluginSource, setPluginEnabled, updatePlugin } from "@/lib/canvas/plugin-loader";
import type { InstalledPlugin } from "@/stores/canvas/use-plugin-store";

const baseUrl = () => `${import.meta.env.BASE_URL}plugins/`;
const bundledUrl = () => `${baseUrl()}approved.js`;

function installed(url: string, source = "export default {}") {
    return {
        id: "fixture",
        name: "Fixture",
        version: "1.0.0",
        url,
        source,
        enabled: false,
        installedAt: "2026-01-01T00:00:00.000Z",
    } satisfies InstalledPlugin;
}

describe("plugin source policy", () => {
    beforeEach(() => {
        hostBridge.isEmbedded.mockReturnValue(false);
        hostBridge.lockedApiBaseUrl.mockReturnValue(window.location.origin);
        pluginStore.plugins = [];
        vi.unstubAllGlobals();
    });

    it.each(["javascript:alert(1)", "data:text/javascript,export default {}", "blob:https://example.test/id"])("rejects executable URL scheme %s", (url) => {
        expect(() => assertPluginSourceAllowed(url)).toThrow("插件地址协议不受支持");
    });

    it("rejects external origins and userinfo even in standalone mode", () => {
        expect(() => assertPluginSourceAllowed("https://plugins.example.test/plugin.js")).toThrow("只允许安装本站自带的插件");
        const userInfoUrl = `${window.location.protocol}//user:password@${window.location.host}/plugin.js`;
        expect(() => assertPluginSourceAllowed(userInfoUrl)).toThrow("不允许携带账号信息");
    });

    it("keeps standalone installs compatible with same-origin custom paths", () => {
        const customUrl = "/user-plugins/custom.js";
        expect(assertPluginSourceAllowed(customUrl).pathname).toBe(customUrl);
        expect(canLoadInstalledPlugin(installed(customUrl))).toBe(true);
        expect(isBundledPluginSource(customUrl)).toBe(false);
        expect(isBundledPluginSource(bundledUrl())).toBe(true);
    });

    it("requires the build bundled plugin directory in embedded mode", () => {
        hostBridge.isEmbedded.mockReturnValue(true);
        hostBridge.lockedApiBaseUrl.mockReturnValue(window.location.origin);

        expect(assertPluginSourceAllowed(bundledUrl()).pathname).toBe(`${baseUrl()}approved.js`);
        expect(() => assertPluginSourceAllowed("/user-plugins/custom.js")).toThrow("只能加载随镜像发布的插件");
        expect(canLoadInstalledPlugin(installed(bundledUrl()))).toBe(true);
        expect(canLoadInstalledPlugin(installed("/user-plugins/custom.js"))).toBe(false);
    });

    it("fails closed when an embedded document has an opaque or untrusted origin", () => {
        hostBridge.isEmbedded.mockReturnValue(true);
        hostBridge.lockedApiBaseUrl.mockReturnValue("");

        expect(() => assertPluginSourceAllowed(bundledUrl())).toThrow("无法验证主站地址");
        expect(canLoadInstalledPlugin(installed(bundledUrl()))).toBe(false);
    });

    it.each([`${baseUrl()}%252e%252e/escape.js`, `${baseUrl()}nested/%2e%2e/escape.js`, `${baseUrl()}safe.js?api%2520key=leaked`, `${baseUrl()}safe.js#authorization=leaked`])(
        "rejects encoded traversal or credential markers in embedded URLs: %s",
        (url) => {
            hostBridge.isEmbedded.mockReturnValue(true);
            hostBridge.lockedApiBaseUrl.mockReturnValue(window.location.origin);
            expect(() => assertPluginSourceAllowed(url)).toThrow();
        },
    );

    it("re-fetches embedded cached plugins and passes redirect:error before evaluating source", async () => {
        hostBridge.isEmbedded.mockReturnValue(true);
        hostBridge.lockedApiBaseUrl.mockReturnValue(window.location.origin);
        const fetchMock = vi.fn().mockResolvedValue({ ok: false, status: 503 } as Response);
        vi.stubGlobal("fetch", fetchMock);
        const record = installed(bundledUrl(), 'throw new Error("cached source must not execute")');

        await expect(setPluginEnabled(record, true)).rejects.toThrow("HTTP 503");

        expect(fetchMock).toHaveBeenCalledTimes(1);
        const [requestUrl, requestInit] = fetchMock.mock.calls[0];
        expect(String(requestUrl)).toMatch(/plugins\/approved\.js\?t=\d+$/);
        expect(requestInit).toEqual({ redirect: "error" });
        expect(pluginStore.setEnabled).not.toHaveBeenCalled();
    });

    it("keeps the cache-busting query before a URL fragment", async () => {
        hostBridge.isEmbedded.mockReturnValue(true);
        hostBridge.lockedApiBaseUrl.mockReturnValue(window.location.origin);
        const fetchMock = vi.fn().mockResolvedValue({ ok: false, status: 503 } as Response);
        vi.stubGlobal("fetch", fetchMock);

        await expect(setPluginEnabled(installed(`${bundledUrl()}#stable`), true)).rejects.toThrow("HTTP 503");

        expect(String(fetchMock.mock.calls[0][0])).toMatch(/plugins\/approved\.js\?t=\d+#stable$/);
    });

    it("evaluates freshly fetched embedded source instead of persisted cached source", async () => {
        hostBridge.isEmbedded.mockReturnValue(true);
        hostBridge.lockedApiBaseUrl.mockReturnValue(window.location.origin);
        const fetchedSource = 'export default { id: "fetched", nodes: [{}] };';
        const fetchMock = vi.fn().mockResolvedValue({ ok: true, status: 200, text: async () => fetchedSource } as Response);
        vi.stubGlobal("fetch", fetchMock);

        class BlobFixture {
            readonly source: string;

            constructor(parts: BlobPart[]) {
                this.source = parts.map((part) => String(part)).join("");
            }
        }
        vi.stubGlobal("Blob", BlobFixture as unknown as typeof Blob);
        vi.spyOn(URL, "createObjectURL").mockImplementation((blob) => `data:text/javascript,${encodeURIComponent((blob as unknown as BlobFixture).source)}`);
        vi.spyOn(URL, "revokeObjectURL").mockImplementation(() => undefined);

        const record = installed(bundledUrl(), 'throw new Error("cached source must not execute")');
        await setPluginEnabled(record, true);

        expect(nodeRegistry.registerNodeDefinitions).toHaveBeenCalledWith([{}], "fetched");
        expect(pluginStore.setEnabled).toHaveBeenCalledWith("fixture", true);
    });

    it("uses redirect:error for standalone updates as well", async () => {
        const fetchMock = vi.fn().mockRejectedValue(new TypeError("redirect rejected"));
        vi.stubGlobal("fetch", fetchMock);

        await expect(updatePlugin(installed("/user-plugins/custom.js"))).rejects.toThrow("redirect rejected");

        expect(fetchMock).toHaveBeenCalledTimes(1);
        expect(fetchMock.mock.calls[0][1]).toEqual({ redirect: "error" });
    });
});
