import { registerNodeDefinitions, unregisterPluginNodes } from "@/lib/canvas/node-registry";
import { getPluginRuntime } from "@/lib/canvas/plugin-runtime";
import { isEmbedded, lockedApiBaseUrl } from "@/lib/host-bridge";
import { usePluginStore, type InstalledPlugin } from "@/stores/canvas/use-plugin-store";
import type { CanvasPlugin } from "@/types/canvas-plugin";

const cleanups = new Map<string, () => void>();

// 远程插件默认导出可以是 CanvasPlugin,或接收 runtime 返回 CanvasPlugin 的工厂
// (工厂形式用 runtime.React,无需 bundle 自带 React)
async function evaluatePluginSource(source: string): Promise<CanvasPlugin> {
    const blob = new Blob([source], { type: "text/javascript" });
    const url = URL.createObjectURL(blob);
    try {
        const mod = (await import(/* @vite-ignore */ url)) as { default?: unknown; plugin?: unknown };
        const exported = mod.default ?? mod.plugin;
        const plugin = typeof exported === "function" ? (exported as (runtime: unknown) => unknown)(getPluginRuntime()) : exported;
        assertPlugin(plugin);
        return plugin;
    } finally {
        URL.revokeObjectURL(url);
    }
}

function assertPlugin(plugin: unknown): asserts plugin is CanvasPlugin {
    const value = plugin as Partial<CanvasPlugin> | null;
    if (!value || typeof value !== "object") throw new Error("插件未导出有效对象");
    if (!value.id || !Array.isArray(value.nodes) || !value.nodes.length) throw new Error("插件缺少 id 或 nodes");
}

export function activatePlugin(plugin: CanvasPlugin) {
    registerNodeDefinitions(plugin.nodes, plugin.id);
    const runtime = getPluginRuntime();
    const disposers: Array<() => void> = [];
    // 插件声明的样式:启用时注入,禁用/卸载时清理
    if (plugin.css) disposers.push(runtime.injectCSS(plugin.css, plugin.id));
    const cleanup = plugin.setup?.(runtime);
    if (typeof cleanup === "function") disposers.push(cleanup);
    if (disposers.length) cleanups.set(plugin.id, () => disposers.forEach((dispose) => dispose()));
}

export function deactivatePlugin(pluginId: string) {
    cleanups.get(pluginId)?.();
    cleanups.delete(pluginId);
    unregisterPluginNodes(pluginId);
}

export type PluginSourcePolicy = {
    /** Require the URL to point at the immutable plugin directory shipped in this image. */
    bundled?: boolean;
};

// URL query strings, fragments, and paths are routinely copied to access logs,
// browser history, and referrer headers. Embedded Canvas runs with a signed-in
// user's relay key, so a persisted/plugin-authored URL must never contain a
// credential marker in any of those components. Keep this check deliberately
// independent from the server's query parser: decode repeated percent
// encoding and inspect both the encoded and normalized URL components.
const CREDENTIAL_URL_MARKER = /(?:^|[^a-z0-9])(?:api\s*key|apikey|access\s*key|private\s*key|client\s*secret|token|password|passwd|secret|authorization|bearer|key)(?:$|[^a-z0-9])/i;

function decodeUrlPart(value: string) {
    let decoded = value;
    for (let attempt = 0; attempt < 8; attempt += 1) {
        try {
            const next = decodeURIComponent(decoded);
            if (next === decoded) break;
            decoded = next;
        } catch {
            break;
        }
    }
    return decoded;
}

function containsCredentialMarker(value: string) {
    const decoded = decodeUrlPart(value);
    const normalized = decoded.replace(/[^a-z0-9]+/gi, " ").trim();
    return CREDENTIAL_URL_MARKER.test(value) || CREDENTIAL_URL_MARKER.test(decoded) || CREDENTIAL_URL_MARKER.test(normalized);
}

function hasCredentialUrlPart(resolved: URL) {
    // Inspect URL components after parsing rather than the complete raw URL;
    // a trusted host name such as `key.example` must not make every bundled
    // plugin unusable. `pathname` preserves percent-encoded bytes, so the
    // repeated decoder still catches encoded credential names.
    return [resolved.pathname, resolved.search, resolved.hash].some((part) => containsCredentialMarker(part));
}

function hasEncodedPathEscape(raw: string) {
    let value = raw;
    for (let attempt = 0; attempt < 8; attempt += 1) {
        if (/%(?:2e|2f|5c)/i.test(value) || /\\/.test(value)) return true;
        try {
            const next = decodeURIComponent(value);
            if (next === value) break;
            value = next;
        } catch {
            break;
        }
    }
    return false;
}

function validHttpOrigin(value: unknown) {
    if (typeof value !== "string" || !value || value === "null") return "";
    try {
        const parsed = new URL(value);
        if ((parsed.protocol !== "http:" && parsed.protocol !== "https:") || parsed.origin !== value) return "";
        return parsed.origin;
    } catch {
        return "";
    }
}

function documentOrigin() {
    if (isEmbedded()) return validHttpOrigin(lockedApiBaseUrl());
    if (typeof window === "undefined") return "";
    return validHttpOrigin(window.location?.origin);
}

function bundledPluginPrefix(origin: string) {
    const base = typeof import.meta.env.BASE_URL === "string" && import.meta.env.BASE_URL ? import.meta.env.BASE_URL : "/";
    const reference = typeof window !== "undefined" && typeof window.location?.href === "string" ? window.location.href : `${origin}/`;
    try {
        const baseUrl = new URL(base, reference);
        if (baseUrl.origin !== origin) return "";
        const pathname = baseUrl.pathname.endsWith("/") ? baseUrl.pathname : `${baseUrl.pathname}/`;
        return `${pathname}plugins/`;
    } catch {
        return "";
    }
}

/**
 * Validate a plugin source before it is fetched or evaluated.
 *
 * Plugin modules are loaded with a blob dynamic import and therefore execute
 * in the page realm. Standalone mode keeps the existing same-origin policy;
 * embedded mode additionally requires the immutable `/plugins/` directory
 * under the current build base path. The latter prevents a persisted or
 * manually entered same-origin URL from becoming executable page code.
 *
 * The resolved URL is returned so callers can use the canonical value without
 * reparsing it. No caller should bypass this check before `evaluatePluginSource`.
 */
export function assertPluginSourceAllowed(rawUrl: string, policy: PluginSourcePolicy = {}): URL {
    const raw = typeof rawUrl === "string" ? rawUrl.trim() : "";
    if (!raw) throw new Error("插件地址无效");

    const origin = documentOrigin();
    if (!origin) throw new Error(isEmbedded() ? "内嵌画布无法验证主站地址" : "插件地址无效");

    let resolved: URL;
    try {
        const reference = typeof window !== "undefined" && typeof window.location?.href === "string" ? window.location.href : `${origin}/`;
        resolved = new URL(raw, reference);
    } catch {
        throw new Error("插件地址无效");
    }

    if (resolved.protocol !== "http:" && resolved.protocol !== "https:") throw new Error("插件地址协议不受支持");
    if (resolved.username || resolved.password) throw new Error("插件地址不允许携带账号信息");
    if (resolved.origin !== origin) throw new Error("出于安全考虑，只允许安装本站自带的插件");

    if (isEmbedded() && hasCredentialUrlPart(resolved)) throw new Error("出于安全考虑，内嵌插件地址不能携带凭据");

    // Embedded mode always requires the bundled directory. The option can
    // tighten standalone validation, but it must never weaken the embedded
    // policy at an alternate call site.
    const requireBundled = isEmbedded() || policy.bundled === true;
    if (requireBundled) {
        const prefix = bundledPluginPrefix(origin);
        // Browsers normalize literal dot segments, but an origin server may
        // decode escaped separators/dots before routing. Reject those forms
        // so an apparently bundled URL cannot resolve outside the directory.
        if (!prefix || !resolved.pathname.startsWith(prefix) || hasEncodedPathEscape(raw)) throw new Error("出于安全考虑，内嵌画布只能加载随镜像发布的插件");
    }
    return resolved;
}

/** True when a URL is inside the build's shipped plugin directory. */
export function isBundledPluginSource(rawUrl: string) {
    try {
        assertPluginSourceAllowed(rawUrl, { bundled: true });
        return true;
    } catch {
        return false;
    }
}

/**
 * Check persisted plugin provenance without trusting the mutable local store.
 * The URL path is the trust anchor; `local`/`official` flags are metadata only.
 */
export function canLoadInstalledPlugin(record: Pick<InstalledPlugin, "url">) {
    if (!record || typeof record.url !== "string") return false;
    try {
        assertPluginSourceAllowed(record.url, { bundled: isEmbedded() });
        return true;
    } catch {
        return false;
    }
}

async function fetchPluginSource(url: string) {
    const resolved = assertPluginSourceAllowed(url);
    // Do not follow a same-origin redirect to an external script. A redirect
    // would otherwise turn a trusted path into executable third-party code.
    const response = await fetch(resolved.toString(), { redirect: "error" });
    if (!response.ok) throw new Error(`下载失败 (HTTP ${response.status})`);
    return response.text();
}

// 加缓存穿透参数,配合 watch 构建拿到最新产物
function withCacheBust(rawUrl: string) {
    const cacheBust = String(Date.now());
    try {
        const reference = typeof window !== "undefined" && typeof window.location?.href === "string" ? window.location.href : undefined;
        const resolved = reference ? new URL(rawUrl, reference) : new URL(rawUrl);
        resolved.searchParams.set("t", cacheBust);
        return resolved.toString();
    } catch {
        // Keep the fallback useful for non-browser callers while preserving a
        // fragment's position after the query string.
        const hashIndex = rawUrl.indexOf("#");
        const beforeHash = hashIndex >= 0 ? rawUrl.slice(0, hashIndex) : rawUrl;
        const hash = hashIndex >= 0 ? rawUrl.slice(hashIndex) : "";
        return `${beforeHash}${beforeHash.includes("?") ? "&" : "?"}t=${cacheBust}${hash}`;
    }
}

// 从 URL 安装(或覆盖更新)一个插件,成功后立即启用。
// bustCache=true 时下载绕过 HTTP/CDN 缓存(升级场景必需,避免拿到旧产物),
// 但落库的 url 始终保持干净(不带 ?t=),便于后续再次更新。
export async function installPluginFromUrl(url: string, opts?: { official?: boolean; bustCache?: boolean }) {
    const source = await fetchPluginSource(opts?.bustCache ? withCacheBust(url) : url);
    const plugin = await evaluatePluginSource(source);
    deactivatePlugin(plugin.id); // 覆盖旧版本
    usePluginStore.getState().upsert({ id: plugin.id, name: plugin.name || plugin.id, version: plugin.version || "0.0.0", description: plugin.description, url, source, enabled: true, official: opts?.official });
    activatePlugin(plugin);
    return plugin;
}

export async function updatePlugin(record: InstalledPlugin) {
    // 升级必须拿到最新产物,强制绕过缓存
    return installPluginFromUrl(record.url, { official: record.official, bustCache: true });
}

export async function setPluginEnabled(record: InstalledPlugin, enabled: boolean) {
    if (!enabled) {
        usePluginStore.getState().setEnabled(record.id, false);
        deactivatePlugin(record.id);
        return;
    }

    if (!canLoadInstalledPlugin(record)) throw new Error(isEmbedded() ? "出于安全考虑，内嵌画布只能启用随镜像发布的插件" : "插件地址无效");

    // Embedded mode never executes persisted source: localStorage is mutable
    // by the page and an old cached body could be replaced independently of
    // its URL. Re-fetch the trusted bundled URL before evaluating it. In
    // standalone mode preserve the existing offline cache for non-local
    // installs.
    const source = isEmbedded() || record.local ? await fetchPluginSource(withCacheBust(record.url)) : record.source;
    const plugin = await evaluatePluginSource(source);
    activatePlugin(plugin);
    usePluginStore.getState().setEnabled(record.id, true);
}

export function uninstallPlugin(id: string) {
    deactivatePlugin(id);
    usePluginStore.getState().remove(id);
}

let loaded = false;

// 应用启动时加载已安装且启用的插件
export async function ensurePluginsLoaded() {
    if (loaded) return;
    loaded = true;
    await usePluginStore.persist.rehydrate();
    await loadLocalPlugins(); // 先发现本地插件(默认关闭),再统一按 enabled 激活
    const records = usePluginStore.getState().plugins.filter((record) => record.enabled);
    await Promise.all(
        records.map(async (record) => {
            try {
                if (!canLoadInstalledPlugin(record)) {
                    // Keep the record for standalone use and for user review,
                    // but never execute an untrusted persisted entry here.
                    throw new Error(isEmbedded() ? "内嵌画布跳过非随镜像发布的插件" : "插件地址无效");
                }
                // Embedded mode always re-fetches from the bundled path. In
                // standalone mode local plugins are refreshed while other
                // installs keep their existing offline source behavior.
                const source = isEmbedded() || record.local ? await fetchPluginSource(withCacheBust(record.url)) : record.source;
                activatePlugin(await evaluatePluginSource(source));
            } catch {
                // Plugin source and evaluation errors can echo credentials;
                // never send the raw error or persisted plugin metadata to the
                // browser console.
                console.error("[plugin] 加载失败");
            }
        }),
    );
    await loadDevPlugins();
}

// 自动发现 web/public/plugins 下的本地插件:加入列表但默认关闭,
// 本地开发放好插件文件即可在管理器里看到并一键启用,无需手动填 URL。
// 已在列表中的:刷新元数据(version/name/description/source)到最新产物,
// 但保留用户的 enabled 开关 —— 否则改了插件版本后,持久化 store 里的旧 version 永不更新。
async function loadLocalPlugins() {
    let urls: unknown;
    try {
        // 挂在子路径下发布，清单也在子路径里，写死 /plugins 会打到主站路由上。
        const manifestUrl = assertPluginSourceAllowed(`${import.meta.env.BASE_URL}plugins/index.json`).toString();
        const response = await fetch(manifestUrl, { redirect: "error" });
        if (!response.ok) return;
        urls = await response.json();
    } catch {
        return; // 无本地清单(如生产环境未构建插件)则跳过
    }
    if (!Array.isArray(urls) || !urls.length) return;
    const store = usePluginStore.getState();
    await Promise.all(
        urls.map(async (url: unknown) => {
            try {
                if (typeof url !== "string") throw new Error("插件地址无效");
                const source = await fetchPluginSource(withCacheBust(url));
                const plugin = await evaluatePluginSource(source);
                const existing = store.plugins.find((item) => item.id === plugin.id);
                store.upsert({
                    id: plugin.id,
                    name: plugin.name || plugin.id,
                    version: plugin.version || "0.0.0",
                    description: plugin.description,
                    url,
                    source,
                    enabled: existing?.enabled ?? false, // 保留用户开关,新发现默认关闭
                    local: true,
                });
            } catch {
                console.error("[plugin] 本地插件发现失败");
            }
        }),
    );
}

// 本地开发:VITE_DEV_PLUGINS 里的 URL 每次启动都重新拉取(不缓存、不落库),
// 配合 watch 构建即可「改代码→刷新页面」看到最新插件,无需反复安装。
async function loadDevPlugins() {
    // Development overrides are intentionally unavailable in the embedded
    // application. A build-time environment variable is not a provenance
    // guarantee for a page that receives a signed-in user's relay key.
    if (isEmbedded()) return;
    const raw = import.meta.env.VITE_DEV_PLUGINS;
    if (!raw) return;
    const urls = raw
        .split(",")
        .map((item) => item.trim())
        .filter(Boolean);
    await Promise.all(
        urls.map(async (url) => {
            try {
                const source = await fetchPluginSource(withCacheBust(url));
                const plugin = await evaluatePluginSource(source);
                deactivatePlugin(plugin.id);
                activatePlugin(plugin);
                console.info("[plugin] dev 插件已加载");
            } catch {
                console.error("[plugin] dev 插件加载失败");
            }
        }),
    );
}
