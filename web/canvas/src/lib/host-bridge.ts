// 本应用被主站以同源 iframe 内嵌发布,这个文件是与主站之间的全部约定:
//   1. 主站下发自己的设计令牌(与本应用同名的一套 shadcn CSS 变量)和明暗状态,
//      写到本文档上,使内嵌形态跟随主站配色;antd 组件读不到 CSS 变量,所以额外
//      收一份换算好的颜色喂给它的主题。
//   2. 内嵌时接口地址锁定为主站地址,不允许改到别的站点。
//   3. 按需向主站索取当前登录用户的令牌,供 API Key 快捷选择。主站的登录态是内存里
//      的 access token(带刷新轮换),iframe 拿不到,所以只能由主站代取后发过来。
// 独立部署(非内嵌)时不会收到任何消息,一切维持上游默认。
import { create } from "zustand";

import { useThemeStore } from "@/stores/use-theme-store";
import { normalizeHostUserId, parseHostToken, sanitizeHostError, type HostTokenContract } from "@/lib/host-contract";

export const HOST_THEME_MESSAGE = "new-api:canvas-theme";
export const HOST_TOKENS_REQUEST_MESSAGE = "new-api:canvas-tokens-request";
export const HOST_TOKENS_MESSAGE = "new-api:canvas-tokens";
const HOST_USER_RESET_PREFIX = "canvas-user-change-";
const MAX_MESSAGE_ID_LENGTH = 200;
const MAX_HOST_TOKENS = 100;
const MAX_THEME_VALUE_LENGTH = 512;
const MAX_HOST_ERROR_LENGTH = 300;

export type HostTheme = {
    dark: boolean;
    // 与本应用 styles/globals.css 同名的 CSS 变量,原样写入 :root
    vars: Record<string, string>;
    // 已换算成 antd 能解析的颜色(CSS 变量里是 oklch,antd 的调色算法不认)
    accent: string;
    accentText: string;
    surface: string;
    text: string;
};

export type HostToken = HostTokenContract;

type HostThemeStore = {
    theme: HostTheme | null;
    apply: (theme: HostTheme) => void;
};

export const useHostThemeStore = create<HostThemeStore>()((set) => ({
    theme: null,
    apply: (theme) => set({ theme }),
}));

export type HostTokensState = {
    status: "idle" | "loading" | "ready" | "error";
    tokens: HostToken[];
    error: string;
    userId: number;
    requestId: string;
};

export const useHostTokensStore = create<HostTokensState>()(() => ({
    status: "idle",
    tokens: [],
    error: "",
    userId: 0,
    requestId: "",
}));

let requestSequence = 0;
let bridgeCleanup: (() => void) | null = null;
// A logout reset has no follow-up request id. Keep a fence so a delayed
// response from the previous account cannot be accepted merely because the
// cleared state has an empty request id/user id.
let rejectUncorrelatedResponses = false;

export function isEmbedded() {
    return typeof window !== "undefined" && window.parent !== window;
}

/**
 * Resolve the only origin that may receive host-bridge traffic. Opaque
 * origins (sandboxed/data/blob documents) cannot be authenticated against a
 * parent, so they deliberately return an empty value. Callers must treat an
 * empty value as unavailable; falling back to a build-time provider URL could
 * otherwise send the host's relay key to an external site.
 */
function trustedEmbeddedOrigin() {
    if (!isEmbedded() || typeof window === "undefined") return "";
    const origin = window.location.origin;
    if (typeof origin !== "string" || !origin || origin === "null") return "";
    try {
        const parsed = new URL(origin);
        if ((parsed.protocol !== "http:" && parsed.protocol !== "https:") || parsed.origin !== origin) return "";
        return parsed.origin;
    } catch {
        return "";
    }
}

export function hasTrustedEmbeddedOrigin() {
    return Boolean(trustedEmbeddedOrigin());
}

// 内嵌时始终使用当前文档的 origin。即使构建变量误填了外部地址,也不能借由
// iframe 配置把 relay 请求发往第三方站点；opaque origin 则 fail-closed。
export function lockedApiBaseUrl() {
    return trustedEmbeddedOrigin();
}

function createRequestId() {
    requestSequence += 1;
    const random = typeof crypto !== "undefined" && typeof crypto.randomUUID === "function" ? crypto.randomUUID() : Math.random().toString(36).slice(2);
    return `canvas-token-${requestSequence}-${random}`;
}

// 主站按需代取,不在启动时预取:取真实密钥的接口有较严的限流。
export function requestHostTokens(options: { force?: boolean } = {}) {
    const origin = trustedEmbeddedOrigin();
    if (!origin) return "";
    const current = useHostTokensStore.getState();
    if (!options.force && (current.status === "loading" || current.status === "ready")) return current.requestId;
    const requestId = createRequestId();
    rejectUncorrelatedResponses = false;
    useHostTokensStore.setState({ status: "loading", tokens: options.force ? [] : current.tokens, error: "", requestId });
    window.parent.postMessage({ type: HOST_TOKENS_REQUEST_MESSAGE, requestId, ...(options.force ? { force: true } : {}) }, origin);
    return requestId;
}

let lastAcceptedResetId = "";

export function resetHostTokens() {
    useHostTokensStore.setState({ status: "idle", tokens: [], error: "", userId: 0, requestId: "" });
    lastAcceptedResetId = "";
    // Keep the empty state fenced until the next request gets a fresh id. This
    // prevents a delayed legacy response that omitted requestId from restoring
    // credentials after a reset.
    rejectUncorrelatedResponses = true;
}

export function retryHostTokens() {
    if (!isEmbedded()) return "";
    return requestHostTokens({ force: true });
}

function isHostTheme(data: unknown): data is HostTheme & { type: string } {
    if (!data || typeof data !== "object" || Array.isArray(data)) return false;
    const value = data as Record<string, unknown>;
    if (value.type !== HOST_THEME_MESSAGE || typeof value.dark !== "boolean" || !value.vars || typeof value.vars !== "object" || Array.isArray(value.vars)) return false;
    if (
        !isBoundedMessageText(value.accent, MAX_THEME_VALUE_LENGTH) ||
        !isBoundedMessageText(value.accentText, MAX_THEME_VALUE_LENGTH) ||
        !isBoundedMessageText(value.surface, MAX_THEME_VALUE_LENGTH) ||
        !isBoundedMessageText(value.text, MAX_THEME_VALUE_LENGTH)
    )
        return false;
    const vars = value.vars as Record<string, unknown>;
    const entries = Object.entries(vars);
    return entries.length <= 128 && entries.every(([name, item]) => name.startsWith("--") && name.length <= 100 && isBoundedMessageText(item, MAX_THEME_VALUE_LENGTH));
}

function isHostTokensMessage(data: unknown): data is Record<string, unknown> & { type: string } {
    if (!data || typeof data !== "object" || Array.isArray(data)) return false;
    const value = data as Record<string, unknown>;
    if (value.type !== HOST_TOKENS_MESSAGE) return false;
    const hasTokens = Object.hasOwn(value, "tokens");
    const hasError = Object.hasOwn(value, "error");
    if (!hasTokens && !hasError) return false;
    if (hasTokens && !isValidHostTokenArray(value.tokens)) return false;
    if (hasError) {
        if (typeof value.error !== "string") return false;
        // Keep accepting the legacy `{ tokens, error: "" }` envelope while
        // requiring an error-only response to carry a safe, bounded message.
        if (!value.error) {
            if (!hasTokens) return false;
        } else if (!isBoundedMessageText(value.error, MAX_HOST_ERROR_LENGTH)) return false;
    }
    if (hasTokens && hasError && value.error) return false;
    if (value.requestId !== undefined && !isValidMessageId(value.requestId)) return false;
    if (value.userId !== undefined && !isValidUserIdField(value.userId)) return false;
    if (value.reset !== undefined && typeof value.reset !== "boolean") return false;
    return true;
}

function isValidMessageId(value: unknown): value is string {
    return typeof value === "string" && value.length > 0 && value.length <= MAX_MESSAGE_ID_LENGTH && !containsControlCharacters(value);
}

function containsControlCharacters(value: string) {
    for (const character of value) {
        const code = character.charCodeAt(0);
        if (code <= 0x1f || code === 0x7f) return true;
    }
    return false;
}

function isBoundedMessageText(value: unknown, maxLength: number) {
    return typeof value === "string" && value.length > 0 && value.length <= maxLength && !containsControlCharacters(value);
}

function isValidHostTokenValue(value: unknown): value is HostToken {
    if (!value || typeof value !== "object" || Array.isArray(value)) return false;
    const item = value as Record<string, unknown>;
    return normalizeHostUserId(item.id) > 0 && typeof item.name === "string" && item.name.length <= 120 && isBoundedMessageText(item.key, 512);
}

function isValidHostTokenArray(value: unknown): value is unknown[] {
    return Array.isArray(value) && value.length <= MAX_HOST_TOKENS && value.every(isValidHostTokenValue);
}

function isValidUserIdField(value: unknown) {
    if (typeof value === "number") return Number.isSafeInteger(value) && value >= 0;
    if (typeof value !== "string" || !/^(?:0|[1-9]\d*)$/.test(value)) return false;
    const id = Number(value);
    return Number.isSafeInteger(id) && id >= 0;
}

function readHostTokens(data: Record<string, unknown>): HostToken[] {
    if (!isValidHostTokenArray(data.tokens)) return [];
    const result: HostToken[] = [];
    const seenIds = new Set<number>();
    const seenKeys = new Set<string>();
    for (const item of data.tokens) {
        const token = parseHostToken(item);
        if (!token || seenIds.has(token.id) || seenKeys.has(token.key)) continue;
        seenIds.add(token.id);
        seenKeys.add(token.key);
        result.push(token);
    }
    return result;
}

function readHostUserId(data: Record<string, unknown>, fallback: number) {
    if (!("userId" in data)) return fallback;
    return normalizeHostUserId(data.userId);
}

function isHostUserReset(data: Record<string, unknown>, requestId: string) {
    if (!isValidMessageId(requestId) || data.error || !Array.isArray(data.tokens) || data.tokens.length !== 0 || !Object.hasOwn(data, "userId") || !isValidUserIdField(data.userId)) return false;
    // New parents set an explicit reset bit. Older deployed parents only used
    // the reserved request-id prefix; accept that form for compatibility but
    // require the same empty-token/user-id shape so ordinary responses cannot
    // be mistaken for an account reset.
    if (data.reset === true) return true;
    return data.reset === undefined && requestId.startsWith(HOST_USER_RESET_PREFIX);
}

export { normalizeHostUserId, sanitizeHostError } from "@/lib/host-contract";

/**
 * Install the message listener once. Returning cleanup makes HMR and isolated
 * tests safe: re-initializing the bridge cannot multiply token/theme handlers.
 */
export function initHostBridge() {
    const origin = trustedEmbeddedOrigin();
    if (!origin) {
        // If an iframe is moved to an opaque origin while HMR/tests are
        // running, remove a listener that was installed under the old origin
        // instead of leaving a stale bridge alive.
        bridgeCleanup?.();
        bridgeCleanup = null;
        // Do not retain a token response if an embedded document loses its
        // trustworthy origin (for example after a sandbox/HMR transition).
        // Standalone pages are already idle, while an embedded page must fail
        // closed instead of reusing the previous account's credentials.
        if (isEmbedded()) resetHostTokens();
        return () => undefined;
    }
    if (bridgeCleanup) return bridgeCleanup;

    const onMessage = (event: MessageEvent) => {
        // 同源并不等于来自宿主:同源的其它窗口也能向 iframe 发消息,所以必须
        // 同时确认 origin 和 source,避免任意页面伪造登录用户或主题状态。
        if (event.origin !== origin || event.source !== window.parent) return;
        if (isHostTheme(event.data)) {
            const root = document.documentElement;
            for (const [name, value] of Object.entries(event.data.vars)) root.style.setProperty(name, value);
            useThemeStore.getState().setTheme(event.data.dark ? "dark" : "light");
            useHostThemeStore.getState().apply(event.data);
            return;
        }

        if (!isHostTokensMessage(event.data)) return;
        const state = useHostTokensStore.getState();
        const requestId = typeof event.data.requestId === "string" ? event.data.requestId : "";
        const userId = readHostUserId(event.data, state.userId);
        const tokens = readHostTokens(event.data);
        const isUserReset = isHostUserReset(event.data, requestId);

        // Account-change resets are generated by the trusted parent and must be
        // accepted even when the old request is still in flight. Every other
        // response must belong to the request currently tracked by the iframe;
        // this rejects late responses from a previous account (including a
        // response that omitted requestId for backwards compatibility).
        if (isUserReset) {
            // The parent may deliver a reset more than once while React is
            // remounting the iframe. Treat the reset as an edge, not a level;
            // otherwise every duplicate would force another request and could
            // create a reset/request loop.
            if (requestId === lastAcceptedResetId) return;
            lastAcceptedResetId = requestId;
            rejectUncorrelatedResponses = true;
            useHostTokensStore.setState({ status: "idle", tokens: [], error: "", userId, requestId: "" });
            if (userId > 0) requestHostTokens({ force: true });
            return;
        }
        if (state.requestId && !requestId) return;
        if (requestId && state.requestId && requestId !== state.requestId) return;
        if (rejectUncorrelatedResponses && (!state.requestId || !requestId || requestId !== state.requestId)) return;
        if (state.userId && userId !== state.userId) return;

        const error = typeof event.data.error === "string" ? sanitizeHostError(event.data.error) : "";
        if (error) {
            useHostTokensStore.setState({ status: "error", tokens: [], error, userId, requestId: requestId || state.requestId });
            return;
        }
        useHostTokensStore.setState({ status: "ready", tokens, error: "", userId, requestId: requestId || state.requestId });
    };

    window.addEventListener("message", onMessage);

    // 告诉父页面可以下发主题了(iframe 的 load 事件在父页面那边不总是可靠)
    window.parent.postMessage({ type: `${HOST_THEME_MESSAGE}:ready` }, origin);

    const cleanup = () => {
        window.removeEventListener("message", onMessage);
        if (bridgeCleanup === cleanup) bridgeCleanup = null;
        lastAcceptedResetId = "";
        rejectUncorrelatedResponses = false;
    };
    bridgeCleanup = cleanup;
    return cleanup;
}
