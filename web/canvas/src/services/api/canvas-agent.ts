import i18n from "@/i18n";
import { sanitizeAgentError, sanitizeAgentValue, validateAgentEndpoint } from "@/lib/agent/agent-security";
import type { CanvasAgentSnapshot } from "@/lib/canvas/canvas-agent-ops";
import type { AgentReasoningEffort } from "@/stores/use-agent-store";

type AgentConfigResponse = { ok?: boolean; protocolVersion?: number; url?: string; token?: string; hasToken?: boolean };
const AGENT_MESSAGE_ASSET_PATTERN = /^agent-asset:([a-f0-9]{64})\/([a-f0-9]{64}\.(?:gif|jpe?g|png|webp))$/;
const AGENT_SENSITIVE_QUERY_KEY =
    /^(?:access[_-]?(?:key|token)|api[_-]?(?:key|token)|authorization|bearer|connect[_-]?(?:key|token)|credential|key|password|private[_-]?key|proxy[_-]?authorization|refresh[_-]?token|secret|session[_-]?(?:key|token)|token)$/i;

export class AgentApiError<T = unknown> extends Error {
    readonly response: T & { code?: string; error?: string; msg?: string };

    constructor(
        readonly status: number,
        response: T & { code?: string; error?: string; msg?: string },
        secrets: readonly string[] = [],
    ) {
        const safeResponse = sanitizeAgentValue(response, secrets) as T & { code?: string; error?: string; msg?: string };
        super(sanitizeAgentError(response.error || response.msg, secrets, i18n.t("agent.state.requestFailed")));
        this.response = safeResponse;
        this.name = "AgentApiError";
    }
}

export type AgentSkillScope = "user" | "repo" | "system" | "admin";
export type AgentSkillInterface = { displayName?: string | null; shortDescription?: string | null; defaultPrompt?: string | null };
export type AgentSkillSummary = {
    name: string;
    description: string;
    shortDescription?: string | null;
    interface?: AgentSkillInterface | null;
    dependencies?: unknown;
    path: string;
    scope: AgentSkillScope;
    enabled: boolean;
    managed: boolean;
};
export type AgentSkillDetail = {
    name: string;
    description: string;
    instructions: string;
    interface?: AgentSkillInterface | null;
    path: string;
    managed: true;
    revision: string;
};
export type AgentSkillInput = { name?: string; description: string; instructions: string; interface?: AgentSkillInterface | null; expectedRevision?: string };
export type AgentSkillDraft = { name: string; displayName: string; description: string; instructions: string; shortDescription: string; defaultPrompt: string };
export type AgentSkillDraftInput = { source: "conversation" | "canvas"; threadId: string; clientId: string; model?: string; effort?: AgentReasoningEffort };
export type AgentSkillsResponse = { ok?: boolean; data?: AgentSkillSummary[]; errors?: unknown[] };
export type AgentSkillResponse = { ok?: boolean; data?: AgentSkillDetail };
export type AgentSkillDraftResponse = { ok?: boolean; data?: AgentSkillDraft };

export async function postState(endpoint: string, token: string, clientId: string, snapshot: CanvasAgentSnapshot | null) {
    try {
        const response = await fetchAgentRequest(endpoint, token, `/canvas/state?clientId=${encodeURIComponent(clientId)}`, {
            method: "POST",
            headers: { "content-type": "application/json" },
            body: JSON.stringify(snapshot ? { ...snapshot, hasCanvas: true } : { hasCanvas: false }),
        });
        return response.ok;
    } catch {
        return false;
    }
}

export async function activateAgentClient(endpoint: string, token: string, clientId: string) {
    try {
        await fetchAgentRequest(endpoint, token, `/canvas/activate?clientId=${encodeURIComponent(clientId)}`, { method: "POST" });
    } catch {}
}

export async function postToolResult(endpoint: string, token: string, clientId: string, body: { requestId: string; result?: unknown; error?: string }) {
    await fetchAgentJson(endpoint, token, `/canvas/result?clientId=${encodeURIComponent(clientId)}`, { method: "POST", headers: { "content-type": "application/json" }, body: JSON.stringify(body) });
}

export async function postCodexApproval(endpoint: string, token: string, requestId: string, decision: "accept" | "acceptForSession" | "decline") {
    await fetchAgentJson(endpoint, token, "/agent/codex/approval", { method: "POST", headers: { "content-type": "application/json" }, body: JSON.stringify({ requestId, decision }) });
}

export async function interruptCodexTurn(endpoint: string, token: string, threadId?: string) {
    await fetchAgentJson(endpoint, token, "/agent/codex/interrupt", jsonPost({ threadId }));
}

export async function acknowledgeCodexHistory(endpoint: string, token: string, threadId: string, turnIds: string[]) {
    await fetchAgentJson(endpoint, token, "/agent/codex/history/ack", { method: "POST", headers: { "content-type": "application/json" }, body: JSON.stringify({ threadId, turnIds }) });
}

export async function revealAgentLocalFile(endpoint: string, token: string, path: string) {
    await fetchAgentJson(endpoint, token, "/agent/local-file/reveal", { method: "POST", headers: { "content-type": "application/json" }, body: JSON.stringify({ path }) });
}

export function resolveAgentMessageAssetUrl(endpoint: string, token: string, value: string) {
    const match = AGENT_MESSAGE_ASSET_PATTERN.exec(value);
    if (!match) return value.startsWith("agent-asset:") ? "" : value;
    const validation = validateAgentEndpoint(endpoint);
    return validation.ok ? `${validation.endpoint}/agent/message-assets/${match[1]}/${match[2]}` : "";
}

/** Fetch a message asset with the token in a request header. Callers should
 * convert the returned blob to an object URL before rendering it. */
export function isAgentMessageAsset(value: string) {
    return AGENT_MESSAGE_ASSET_PATTERN.test(value);
}

export async function fetchAgentMessageAsset(endpoint: string, token: string, value: string, signal?: AbortSignal) {
    const match = AGENT_MESSAGE_ASSET_PATTERN.exec(value);
    if (!match) return null;
    const response = await fetchAgentRequest(endpoint, token, `/agent/message-assets/${match[1]}/${match[2]}`, { signal });
    if (!response.ok) {
        const body = (await response.json().catch(() => ({}))) as { error?: string; msg?: string };
        throw new AgentApiError(response.status, body, [token]);
    }
    return response.blob();
}

export function fetchCodexSkills(endpoint: string, token: string, forceReload = false) {
    return fetchAgentJson<AgentSkillsResponse>(endpoint, token, `/agent/codex/skills${forceReload ? "?forceReload=1" : ""}`);
}

export function fetchCodexSkill(endpoint: string, token: string, name: string) {
    return fetchAgentJson<AgentSkillResponse>(endpoint, token, `/agent/codex/skills/${encodeURIComponent(name)}`);
}

export function createCodexSkill(endpoint: string, token: string, input: AgentSkillInput) {
    return fetchAgentJson<AgentSkillResponse>(endpoint, token, "/agent/codex/skills", jsonPost(input));
}

export function createCodexSkillDraft(endpoint: string, token: string, input: AgentSkillDraftInput) {
    return fetchAgentJson<AgentSkillDraftResponse>(endpoint, token, "/agent/codex/skills/draft", jsonPost(input));
}

export function updateCodexSkill(endpoint: string, token: string, name: string, input: AgentSkillInput) {
    return fetchAgentJson<AgentSkillResponse>(endpoint, token, `/agent/codex/skills/${encodeURIComponent(name)}`, jsonPost(input));
}

export function deleteCodexSkill(endpoint: string, token: string, name: string, expectedRevision: string) {
    return fetchAgentJson<{ ok?: boolean }>(endpoint, token, `/agent/codex/skills/${encodeURIComponent(name)}/delete`, jsonPost({ expectedRevision }));
}

export function setCodexSkillEnabled(endpoint: string, token: string, skill: Pick<AgentSkillSummary, "name" | "path">, enabled: boolean) {
    return fetchAgentJson<{ ok?: boolean }>(endpoint, token, `/agent/codex/skills/${encodeURIComponent(skill.name)}/enabled`, jsonPost({ ...skill, enabled }));
}

export async function fetchAgentJson<T>(endpoint: string, token: string, path: string, init?: RequestInit) {
    const res = await fetchAgentRequest(endpoint, token, path, init);
    const data = (await res.json().catch(() => ({}))) as T & { error?: string; msg?: string };
    if (!res.ok) throw new AgentApiError(res.status, data, [token]);
    return data;
}

/** Build an Agent URL without putting credentials in the URL. */
export function agentRequestUrl(endpoint: string, path: string, params: Record<string, string> = {}) {
    const validation = validateAgentEndpoint(endpoint);
    if (!validation.ok) throw new Error(i18n.t("agent.state.invalidUrl"));
    if (typeof path !== "string" || !path.startsWith("/") || path.startsWith("//") || path.includes("\\") || path.includes("#")) throw new Error(i18n.t("agent.state.requestFailed"));
    const queryIndex = path.indexOf("?");
    const pathname = queryIndex < 0 ? path : path.slice(0, queryIndex);
    let decodedPath: string;
    try {
        decodedPath = decodeURIComponent(pathname);
    } catch {
        throw new Error(i18n.t("agent.state.requestFailed"));
    }
    if (decodedPath.split("/").some((segment) => segment === "." || segment === "..")) throw new Error(i18n.t("agent.state.requestFailed"));
    const query = queryIndex < 0 ? "" : path.slice(queryIndex + 1);
    for (const part of query.split("&")) {
        if (!part) continue;
        const key = part.split("=", 1)[0];
        let decodedKey: string;
        try {
            decodedKey = decodeURIComponent(key);
        } catch {
            throw new Error(i18n.t("agent.state.requestFailed"));
        }
        if (AGENT_SENSITIVE_QUERY_KEY.test(decodedKey.trim())) {
            throw new Error(i18n.t("agent.state.requestFailed"));
        }
    }
    const base = new URL(validation.endpoint);
    const basePath = base.pathname.replace(/\/+$/, "");
    const relativePath = path.replace(/^\/+/, "");
    const url = new URL(`${basePath}/${relativePath}`, base.origin);
    const normalizedBasePath = basePath || "/";
    if (normalizedBasePath !== "/" && url.pathname !== normalizedBasePath && !url.pathname.startsWith(`${normalizedBasePath}/`)) throw new Error(i18n.t("agent.state.requestFailed"));
    if (normalizedBasePath === "/" && !url.pathname.startsWith("/")) throw new Error(i18n.t("agent.state.requestFailed"));
    for (const key of Object.keys(params)) if (AGENT_SENSITIVE_QUERY_KEY.test(key.trim())) throw new Error(i18n.t("agent.state.requestFailed"));
    Object.entries(params).forEach(([key, value]) => url.searchParams.set(key, value));
    return url.toString();
}

/** Execute an authenticated Agent request with an explicit header token. */
export async function fetchAgentRequest(endpoint: string, token: string, path: string, init: RequestInit = {}) {
    if (!token.trim()) throw new Error(i18n.t("agent.state.connectionRequired"));
    const url = agentRequestUrl(endpoint, path);
    const headers = new Headers(init.headers);
    headers.set("x-canvas-agent-token", token);
    const requestInit: RequestInit = { ...init, headers };
    try {
        return await fetch(url, requestInit);
    } catch (error) {
        throw new Error(sanitizeAgentError(error, [token]));
    }
}

export type AgentEventStream = {
    addEventListener: (type: string, listener: (event: MessageEvent<string>) => void) => void;
    close: () => void;
    onerror: (() => void) | null;
};

/**
 * Open the Agent SSE stream with the token in a request header. Native
 * EventSource cannot set headers and therefore forces credentials into the
 * URL; a small fetch-based stream keeps the token out of browser history,
 * proxy logs, and Referer headers while preserving the EventSource listener
 * contract used by the panel.
 */
export function openAgentEventStream(endpoint: string, token: string, clientId: string): AgentEventStream {
    const controller = new AbortController();
    const listeners = new Map<string, Array<(event: MessageEvent<string>) => void>>();
    let closed = false;
    const stream: AgentEventStream = {
        addEventListener(type, listener) {
            const registered = listeners.get(type) || [];
            registered.push(listener);
            listeners.set(type, registered);
        },
        close() {
            if (closed) return;
            closed = true;
            controller.abort();
        },
        onerror: null,
    };
    const dispatch = (type: string, data: string) => {
        if (closed) return;
        let event: MessageEvent<string>;
        try {
            event = new MessageEvent(type, { data });
        } catch {
            event = { data, type } as MessageEvent<string>;
        }
        const notify = (listener: (event: MessageEvent<string>) => void) => {
            try {
                listener(event);
            } catch {
                // Keep one malformed event handler from terminating the stream
                // or surfacing an unhandled exception in the host application.
            }
        };
        listeners.get(type)?.slice().forEach(notify);
    };
    const fail = () => {
        if (closed) return;
        try {
            stream.onerror?.();
        } catch {
            // EventSource error callbacks are isolated from the stream reader.
        }
    };
    void (async () => {
        try {
            const response = await fetchAgentRequest(endpoint, token, `/events?clientId=${encodeURIComponent(clientId)}`, {
                headers: { Accept: "text/event-stream", "Cache-Control": "no-cache" },
                signal: controller.signal,
            });
            if (!response.ok) {
                const body = (await response.json().catch(() => ({}))) as { error?: string; msg?: string };
                throw new AgentApiError(response.status, body, [token]);
            }
            if (!response.body) throw new Error(i18n.t("agent.state.requestFailed"));
            const reader = response.body.getReader();
            const decoder = new TextDecoder();
            let buffer = "";
            let eventName = "";
            let dataLines: string[] = [];
            const processLine = (line: string) => {
                if (!line) {
                    if (dataLines.length) dispatch(eventName || "message", dataLines.join("\n"));
                    eventName = "";
                    dataLines = [];
                    return;
                }
                if (line.startsWith(":")) return;
                const separator = line.indexOf(":");
                const field = separator < 0 ? line : line.slice(0, separator);
                const value = separator < 0 ? "" : line.slice(separator + 1).replace(/^ /, "");
                if (field === "event") eventName = value;
                else if (field === "data") dataLines.push(value);
            };
            while (!closed) {
                const chunk = await reader.read();
                if (chunk.done) break;
                buffer += decoder.decode(chunk.value, { stream: true });
                const lines = buffer.split(/\r\n|\r|\n/);
                buffer = lines.pop() || "";
                lines.forEach(processLine);
            }
            // Flush a final UTF-8 code point and dispatch a final unterminated
            // event.  This mirrors browser EventSource behavior for a server
            // that closes immediately after writing its last data line.
            buffer += decoder.decode();
            if (buffer) processLine(buffer);
            processLine("");
            if (!closed) fail();
        } catch (error) {
            if (!closed && !(error instanceof DOMException && error.name === "AbortError")) {
                // Keep diagnostics free of endpoint credentials and response URLs.
                void sanitizeAgentError(error, [token]);
                fail();
            }
        }
    })();
    return stream;
}

export async function discoverAgentConfig(endpoint: string) {
    const validation = validateAgentEndpoint(endpoint);
    if (!validation.ok) return null;
    try {
        const res = await fetch(agentRequestUrl(validation.endpoint, "/config"));
        if (!res.ok) return null;
        const data = (await res.json()) as AgentConfigResponse;
        return data.ok ? data : null;
    } catch {
        return null;
    }
}

function jsonPost(body: unknown): RequestInit {
    return { method: "POST", headers: { "content-type": "application/json" }, body: JSON.stringify(body) };
}
