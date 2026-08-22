// 本应用被主站以同源 iframe 内嵌发布,这个文件是与主站之间的全部约定:
//   1. 主站下发自己的设计令牌(与本应用同名的一套 shadcn CSS 变量)和明暗状态,
//      写到本文档上,使内嵌形态跟随主站配色;antd 组件读不到 CSS 变量,所以额外
//      收一份换算好的颜色喂给它的主题。
//   2. 内嵌时接口地址锁定为主站地址,不允许改到别的站点。
//   3. 按需向主站索取当前登录用户的令牌,供 API Key 快捷选择。主站的登录态是内存里
//      的 access token(带刷新轮换),iframe 拿不到,所以只能由主站代取后发过来。
// 独立部署(非内嵌)时不会收到任何消息,一切维持上游默认。
import { create } from "zustand";

import { DEFAULT_API_BASE_URL } from "@/constant/runtime-config";
import { useThemeStore } from "@/stores/use-theme-store";

export const HOST_THEME_MESSAGE = "new-api:canvas-theme";
export const HOST_TOKENS_REQUEST_MESSAGE = "new-api:canvas-tokens-request";
export const HOST_TOKENS_MESSAGE = "new-api:canvas-tokens";

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

export type HostToken = {
    id: number;
    name: string;
    key: string;
};

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
};

export const useHostTokensStore = create<HostTokensState>()(() => ({
    status: "idle",
    tokens: [],
    error: "",
}));

export function isEmbedded() {
    return typeof window !== "undefined" && window.parent !== window;
}

// 内嵌时接口地址固定为主站地址:本应用是随主站镜像发布的,只对着主站的接口用。
// 非内嵌时返回空串,调用方沿用上游原本的地址逻辑。
export function lockedApiBaseUrl() {
    return isEmbedded() ? DEFAULT_API_BASE_URL : "";
}

// 主站按需代取,不在启动时预取:取真实密钥的接口有较严的限流。
export function requestHostTokens() {
    if (!isEmbedded()) return;
    const { status } = useHostTokensStore.getState();
    if (status === "loading" || status === "ready") return;
    useHostTokensStore.setState({ status: "loading", error: "" });
    window.parent.postMessage({ type: HOST_TOKENS_REQUEST_MESSAGE }, window.location.origin);
}

function isHostTheme(data: unknown): data is HostTheme & { type: string } {
    if (!data || typeof data !== "object") return false;
    const value = data as Record<string, unknown>;
    return value.type === HOST_THEME_MESSAGE && typeof value.dark === "boolean" && Boolean(value.vars) && typeof value.vars === "object";
}

function readHostTokens(data: unknown): HostToken[] {
    const list = (data as { tokens?: unknown }).tokens;
    if (!Array.isArray(list)) return [];
    return list
        .filter((item): item is HostToken => Boolean(item) && typeof item === "object" && typeof (item as HostToken).key === "string" && Boolean((item as HostToken).key))
        .map((item) => ({ id: Number(item.id) || 0, name: String(item.name || "未命名令牌"), key: item.key }));
}

export function initHostBridge() {
    if (!isEmbedded()) return;

    window.addEventListener("message", (event) => {
        // 同源内嵌,只接受同源父页面的消息
        if (event.origin !== window.location.origin) return;
        if (!event.data || typeof event.data !== "object") return;

        if (isHostTheme(event.data)) {
            const root = document.documentElement;
            for (const [name, value] of Object.entries(event.data.vars)) {
                if (name.startsWith("--") && typeof value === "string") root.style.setProperty(name, value);
            }
            useThemeStore.getState().setTheme(event.data.dark ? "dark" : "light");
            useHostThemeStore.getState().apply(event.data);
            return;
        }

        if (event.data.type === HOST_TOKENS_MESSAGE) {
            const error = typeof event.data.error === "string" ? event.data.error : "";
            if (error) {
                useHostTokensStore.setState({ status: "error", tokens: [], error });
                return;
            }
            useHostTokensStore.setState({ status: "ready", tokens: readHostTokens(event.data), error: "" });
        }
    });

    // 告诉父页面可以下发主题了(iframe 的 load 事件在父页面那边不总是可靠)
    window.parent.postMessage({ type: `${HOST_THEME_MESSAGE}:ready` }, window.location.origin);
}
