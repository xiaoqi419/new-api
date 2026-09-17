import axios from "axios";
import { afterEach, beforeEach, expect, test, vi } from "vitest";
import { reconcileHostConfig, startHostBootstrap, stopHostBootstrap, useHostBootstrapStore } from "@/lib/host-bootstrap";
import { resetHostTokens, useHostTokensStore } from "@/lib/host-bridge";
import { CONFIG_STORE_KEY, defaultConfig, persistableConfig, sanitizeEmbeddedConfigStorage, useConfigStore } from "@/stores/use-config-store";

const tokens = [
    { id: 1, name: "First", key: "sk-first" },
    { id: 2, name: "Second", key: "sk-second" },
];
const selected = { ...defaultConfig.channels[0], apiKey: "sk-second", hostTokenId: 2, hostUserId: 7, models: [{ name: "gpt-image-1", capability: "image" as const, verified: true, verifiedKey: "sk-second" }] };
beforeEach(() => {
    Object.defineProperty(window, "parent", { configurable: true, value: { postMessage: vi.fn() } });
    stopHostBootstrap();
    resetHostTokens();
});
afterEach(() => {
    stopHostBootstrap();
    resetHostTokens();
    vi.restoreAllMocks();
    Object.defineProperty(window, "parent", { configurable: true, value: window });
});

test("refresh restores the selected second token without storing credentials", async () => {
    useConfigStore.setState({ config: { ...defaultConfig, channels: [selected] } });
    await useConfigStore.persist.rehydrate();
    expect(JSON.stringify(persistableConfig(useConfigStore.getState().config))).not.toContain("sk-second");
    startHostBootstrap();
    useHostTokensStore.setState({ status: "ready", tokens, userId: 7 });
    await vi.waitFor(() => expect(useHostBootstrapStore.getState().modelStatus).toBe("ready"));
    expect(useConfigStore.getState().config.channels[0]).toMatchObject({ apiKey: "sk-second", hostTokenId: 2, hostUserId: 7 });
});

test("the same token id from another account cannot restore the saved selection", () => {
    useHostTokensStore.setState({ status: "ready", tokens, userId: 8 });
    const next = reconcileHostConfig(persistableConfig({ ...defaultConfig, channels: [selected] }), tokens).config;
    expect(next.channels[0].apiKey).toBe("");
    expect(next.channels[0].models.every((model) => !model.verified)).toBe(true);
});

test("saved models keep each channel's own credential after bootstrap", async () => {
    const first = { ...selected, id: "first", apiKey: "sk-first", hostTokenId: 1, models: [{ ...selected.models[0], verifiedKey: "sk-first" }] };
    useConfigStore.setState({ config: { ...defaultConfig, channels: [first, { ...selected, id: "second" }] } });
    startHostBootstrap();
    useHostTokensStore.setState({ status: "ready", tokens, userId: 7 });
    await vi.waitFor(() => expect(useHostBootstrapStore.getState().modelStatus).toBe("ready"));
    expect(useConfigStore.getState().config.channels.map((channel) => channel.models[0].verifiedKey)).toEqual(["sk-first", "sk-second"]);
});

test.each(["success", "failure"].flatMap((outcome) => ["key", "endpoint", "format"].map((changed) => ({ outcome, changed }))))("late catalog $outcome cannot mutate a channel after its $changed changes", async ({ outcome, changed }) => {
    let resolve!: (value: unknown) => void;
    let reject!: (reason: Error) => void;
    const request = vi.spyOn(axios, "get").mockImplementation(
        () =>
            new Promise((yes, no) => {
                resolve = yes;
                reject = no;
            }),
    );
    useConfigStore.setState({ config: { ...defaultConfig, channels: [{ ...selected, apiKey: "sk-first", hostTokenId: 1, models: [] }] } });
    startHostBootstrap();
    useHostTokensStore.setState({ status: "ready", tokens, userId: 7 });
    await vi.waitFor(() => expect(request).toHaveBeenCalled());
    const replacement = { ...useConfigStore.getState().config.channels[0], models: [{ name: "manual-new-group", capability: "image" as const }] };
    if (changed === "key") replacement.apiKey = "sk-second";
    if (changed === "endpoint") replacement.baseUrl = "https://changed.example";
    if (changed === "format") replacement.apiFormat = "gemini";
    const next = { ...useConfigStore.getState().config, channels: [replacement] };
    useConfigStore.setState({ config: next });
    if (outcome === "success") resolve({ data: { data: [{ id: "old-group-image" }] } });
    else reject(new Error("old request failed"));
    await request.mock.results[0].value.catch(() => undefined);
    await new Promise<void>((done) => queueMicrotask(() => queueMicrotask(done)));
    expect(useConfigStore.getState().config).toBe(next);
});

test("legacy storage sanitization removes relay and verification secrets but retains selection identity", () => {
    localStorage.setItem(
        CONFIG_STORE_KEY,
        JSON.stringify({ state: { config: { ...defaultConfig, apiKey: "sk-global-secret", channels: [{ ...selected, apiKey: "sk-channel-secret", models: [{ ...selected.models[0], verifiedKey: "sk-verification-secret" }] }] } } }),
    );
    sanitizeEmbeddedConfigStorage();
    const serialized = localStorage.getItem(CONFIG_STORE_KEY) || "";
    expect(serialized).not.toContain("sk-global-secret");
    expect(serialized).not.toContain("sk-channel-secret");
    expect(serialized).not.toContain("sk-verification-secret");
    expect(JSON.parse(serialized).state.config.channels[0]).toMatchObject({ hostTokenId: 2, hostUserId: 7 });
});

test("both saved channels generate images with their own restored Authorization header", async () => {
    const { requestGeneration } = await import("@/services/api/image");
    const post = vi.spyOn(axios, "post").mockResolvedValue({ data: { data: [{ b64_json: "aW1hZ2U=" }] } });
    const first = { ...selected, id: "first", apiKey: "sk-first", hostTokenId: 1, models: [{ ...selected.models[0], verifiedKey: "sk-first" }] };
    useConfigStore.setState({ config: { ...defaultConfig, channels: [first, { ...selected, id: "second" }] } });
    await useConfigStore.persist.rehydrate();
    startHostBootstrap();
    useHostTokensStore.setState({ status: "ready", tokens, userId: 7 });
    await vi.waitFor(() => expect(useHostBootstrapStore.getState().modelStatus).toBe("ready"));
    const config = useConfigStore.getState().config;
    await requestGeneration({ ...config, model: "first::gpt-image-1" }, "First image");
    await requestGeneration({ ...config, model: "second::gpt-image-1" }, "Second image");
    expect(post.mock.calls.map((call) => call[2]?.headers?.Authorization)).toEqual(["Bearer sk-first", "Bearer sk-second"]);
});

test("an explicitly revoked selection cannot fall back to the first authorized token", () => {
    useHostTokensStore.setState({ status: "ready", tokens: [tokens[0]], userId: 7 });
    const next = reconcileHostConfig({ ...defaultConfig, apiKey: "sk-first", channels: [selected] }, [tokens[0]]).config;
    expect(next.channels[0].apiKey).toBe("");
    expect(next.apiKey).toBe("");
    expect(next.channels[0].models[0].verified).not.toBe(true);
});
