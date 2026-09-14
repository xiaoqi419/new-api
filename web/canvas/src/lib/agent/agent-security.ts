/**
 * Security helpers for the browser-side Local Agent integration.
 *
 * The Local Agent protocol currently accepts its Connect token in a query
 * parameter (including the SSE endpoint).  That protocol constraint means a
 * token can still appear in the browser's network request metadata.  These
 * helpers make sure the token never gets copied into the Agent UI, event log,
 * clipboard output, or an error string, and that bootstrap URL parameters are
 * removed from the address bar as soon as they are consumed.
 */

export const AGENT_REDACTED = "[REDACTED]";

const MAX_AGENT_ERROR_LENGTH = 600;
const SENSITIVE_AGENT_KEYS = new Set([
    "accesskey",
    "accesstoken",
    "apikey",
    "apitoken",
    "authorization",
    "bearer",
    "clientsecret",
    "connectkey",
    "connecttoken",
    "cookie",
    "credential",
    "credentials",
    "jwt",
    "key",
    "password",
    "privatekey",
    "proxyauthorization",
    "refreshtoken",
    "secret",
    "setcookie",
    "sessionkey",
    "sessiontoken",
    "token",
]);

const SENSITIVE_QUERY_KEY =
    /^(?:access[_-]?key|access[_-]?token|api[_-]?key|api[_-]?token|authorization|bearer|client[_-]?secret|connect[_-]?(?:key|token)|credential|key|password|private[_-]?key|proxy[_-]?authorization|refresh[_-]?token|secret|session[_-]?(?:key|token)|set[-_]?cookie|token)$/i;
const STRONG_CREDENTIAL_MARKER =
    /(?:bearer\s+|basic\s+|(?:^|[\/_ .-])(?:sk|rk|pk)-[a-z0-9]|(?:^|[\/_ .-])(?:sk|rk|pk)_(?:live|test)_[a-z0-9]|(?:^|[\/_ .-])sess_(?:live|test)_[a-z0-9]|(?:^|[\/_ .-])AIza[a-z0-9_-]{12,}|\beyJ[a-z0-9_-]{8,}\.[a-z0-9._-]+\.[a-z0-9._-]+)/i;

type SeenObjects = WeakMap<object, unknown>;

function normalizedKey(key: string) {
    return key.replace(/[^a-z0-9]/gi, "").toLowerCase();
}

function isSensitiveAgentKey(key: string) {
    const normalized = normalizedKey(key);
    if (SENSITIVE_AGENT_KEYS.has(normalized)) return true;
    // Cover names such as requestToken, oauthAccessToken, or signingSecret
    // while keeping usage counters (inputTokens/outputTokens) visible.
    if (normalized.endsWith("token") && !normalized.includes("tokens") && !normalized.includes("usage")) return true;
    if (normalized.endsWith("secret") || normalized.endsWith("password")) return true;
    return normalized.endsWith("apikey") || normalized.endsWith("authorization") || normalized.endsWith("cookie");
}

function safeDecode(value: string) {
    try {
        return decodeURIComponent(value);
    } catch {
        return value;
    }
}

function safeJson(value: unknown) {
    try {
        return JSON.stringify(value, (_key, nested) => (typeof nested === "bigint" ? String(nested) : nested), 2) || "";
    } catch {
        return String(value);
    }
}

function secretVariants(secrets: readonly string[]) {
    const variants = new Set<string>();
    for (const secret of secrets) {
        if (typeof secret !== "string") continue;
        const trimmed = secret.trim();
        // Values supplied by the caller are known secrets, even when a local
        // development Agent uses a short token.  Do not apply this rule to
        // inferred patterns; only explicit secrets reach this function.
        if (!trimmed) continue;
        variants.add(trimmed);
        try {
            variants.add(encodeURIComponent(trimmed));
        } catch {
            // Keep the raw value when URI encoding is unavailable for malformed input.
        }
    }
    return [...variants].sort((a, b) => b.length - a.length);
}

function isSensitiveQueryKey(key: string) {
    return SENSITIVE_QUERY_KEY.test(safeDecode(key).trim());
}

function sanitizeUrl(value: string) {
    if (/^(?:blob|data):/i.test(value)) return AGENT_REDACTED;
    try {
        const parsed = new URL(value);
        parsed.username = "";
        parsed.password = "";
        for (const key of [...parsed.searchParams.keys()]) {
            if (isSensitiveQueryKey(key)) parsed.searchParams.set(key, AGENT_REDACTED);
        }
        // Fragments are not sent to the server, but they are retained in
        // history and clipboard output, so never preserve a credential-bearing
        // fragment in diagnostics.
        if (parsed.hash && /(?:token|key|secret|password|credential|authorization|cookie)/i.test(safeDecode(parsed.hash))) parsed.hash = "";
        return parsed.toString().replace(/\/$/, parsed.pathname === "/" ? "/" : "");
    } catch {
        return value.replace(/(\/\/)[^/@\s]+@/g, `$1${AGENT_REDACTED}@`).replace(/([?&](?:token|key|api[_-]?key|access[_-]?token|secret|password|credential|authorization)=[^&#\s]+)/gi, `$1${AGENT_REDACTED}`);
    }
}

function sanitizeKnownPatterns(value: string) {
    let text = value;
    text = text.replace(/(?:https?|wss?):\/\/[^\s<>"'`]+/gi, (url) => sanitizeUrl(url));
    text = text.replace(/(?:blob|data):[^\s<>"'`]+/gi, AGENT_REDACTED);
    text = text.replace(/\b(?:Bearer|Basic|Digest|Token)\s+[^\s,;)}\]]+/gi, (match) => `${match.split(/\s+/, 1)[0]} ${AGENT_REDACTED}`);
    text = text.replace(/((?:proxy-)?authorization\s*[:=]\s*)(?:"[^"]*"|'[^']*'|[^\s,;}\]]+)/gi, `$1${AGENT_REDACTED}`);
    text = text.replace(/((?:cookie|set-cookie)\s*[:=]\s*)(?:"[^"]*"|'[^']*'|[^\r\n]+)/gi, `$1${AGENT_REDACTED}`);
    text = text.replace(
        /([?&](?:access[_-]?key|access[_-]?token|api[_-]?key|api[_-]?token|authorization|bearer|client[_-]?secret|connect[_-]?(?:key|token)|credential|key|password|private[_-]?key|proxy[_-]?authorization|refresh[_-]?token|secret|session[_-]?(?:key|token)|set[-_]?cookie|token)=)[^&#\s"'<>]*/gi,
        `$1${AGENT_REDACTED}`,
    );
    text = text.replace(
        /((?:"|')?(?:access[_-]?key|access[_-]?token|api[_-]?key|api[_-]?token|authorization|bearer|client[_-]?secret|connect[_-]?(?:key|token)|credential|key|password|private[_-]?key|proxy[_-]?authorization|refresh[_-]?token|secret|session[_-]?(?:key|token)|set[-_]?cookie|token)(?:"|')?\s*[:=]\s*)(["']?)[^\s,"'}\]]+\2/gi,
        `$1$2${AGENT_REDACTED}$2`,
    );
    text = text.replace(/\b(?:sk|rk|pk)-[A-Za-z0-9][A-Za-z0-9._~-]*\b/gi, AGENT_REDACTED);
    text = text.replace(/\b(?:sk|rk|pk)_(?:live|test)_[A-Za-z0-9][A-Za-z0-9._~-]*\b/gi, AGENT_REDACTED);
    text = text.replace(/\bsess_(?:live|test)_[A-Za-z0-9][A-Za-z0-9._~-]*\b/gi, AGENT_REDACTED);
    text = text.replace(/\bAIza[0-9A-Za-z_-]{20,}\b/g, AGENT_REDACTED);
    text = text.replace(/\beyJ[A-Za-z0-9_-]{8,}\.[A-Za-z0-9._-]+\.[A-Za-z0-9._-]+\b/g, AGENT_REDACTED);
    return text;
}

/** Convert arbitrary Agent text into a safe, human-readable representation. */
export function sanitizeAgentSecretText(value: unknown, secrets: readonly string[] = []) {
    let text = value instanceof Error ? value.message : typeof value === "string" ? value : value == null ? "" : safeJson(value);
    text = text.trim();
    if (!text) return "";
    for (const secret of secretVariants(secrets)) text = text.split(secret).join(AGENT_REDACTED);
    return sanitizeKnownPatterns(text);
}

/** Return a bounded error message safe to put in React state or a toast. */
export function sanitizeAgentError(value: unknown, secrets: readonly string[] = [], fallback = "本地 Agent 请求失败") {
    const text = sanitizeAgentSecretText(value, secrets);
    if (!text) return fallback;
    return text.length > MAX_AGENT_ERROR_LENGTH ? `${text.slice(0, MAX_AGENT_ERROR_LENGTH)}…` : text;
}

/** Recursively redact secret-bearing values before placing raw events in state. */
export function sanitizeAgentValue(value: unknown, secrets: readonly string[] = [], seen: SeenObjects = new WeakMap()): unknown {
    if (typeof value === "string" || value instanceof Error) return sanitizeAgentSecretText(value, secrets);
    if (value == null || typeof value !== "object") return value;
    if (value instanceof URL) return sanitizeAgentEndpoint(value.toString());
    const previous = seen.get(value);
    if (previous !== undefined) return previous;
    if (Array.isArray(value)) {
        const result: unknown[] = [];
        seen.set(value, result);
        value.forEach((item) => result.push(sanitizeAgentValue(item, secrets, seen)));
        return result;
    }
    const result: Record<string, unknown> = {};
    seen.set(value, result);
    for (const [key, nested] of Object.entries(value)) result[key] = isSensitiveAgentKey(key) ? AGENT_REDACTED : sanitizeAgentValue(nested, secrets, seen);
    return result;
}

export type AgentEndpointValidation = { ok: true; endpoint: string } | { ok: false; reason: "empty" | "invalid" | "protocol" | "credentials" };

/** Validate and normalize the endpoint accepted by the Local Agent client. */
export function validateAgentEndpoint(value: unknown): AgentEndpointValidation {
    if (typeof value !== "string" || !value.trim()) return { ok: false, reason: "empty" };
    const candidate = value.trim();
    let parsed: URL;
    try {
        parsed = new URL(candidate);
    } catch {
        return { ok: false, reason: "invalid" };
    }
    if (parsed.protocol !== "http:" && parsed.protocol !== "https:") return { ok: false, reason: "protocol" };
    // URL.search/hash are empty for a bare trailing `?`/`#`; inspect the raw
    // input as well so those markers cannot be retained in history or logs.
    if (parsed.username || parsed.password || parsed.search || parsed.hash || candidate.includes("?") || candidate.includes("#")) return { ok: false, reason: "credentials" };
    const decoded = safeDecode(candidate);
    if (STRONG_CREDENTIAL_MARKER.test(decoded)) return { ok: false, reason: "credentials" };
    const endpoint = `${parsed.protocol}//${parsed.host}${parsed.pathname}`.replace(/\/+$/, "");
    return { ok: true, endpoint: endpoint || `${parsed.protocol}//${parsed.host}` };
}

/** Produce a safe endpoint label for diagnostics even when the input is invalid. */
export function sanitizeAgentEndpoint(value: unknown) {
    if (typeof value !== "string") return "";
    const candidate = value.trim();
    if (!candidate) return "";
    try {
        const parsed = new URL(candidate);
        parsed.username = "";
        parsed.password = "";
        parsed.search = "";
        parsed.hash = "";
        const endpoint = `${parsed.protocol}//${parsed.host}${parsed.pathname}`.replace(/\/+$/, "");
        return sanitizeAgentSecretText(endpoint);
    } catch {
        return sanitizeAgentSecretText(candidate.split(/[?#]/, 1)[0]);
    }
}

/** Remove Agent bootstrap credentials from a URL before it remains in history. */
export function stripAgentConnectionParams(value: string) {
    if (typeof value !== "string" || !value) return "";
    try {
        const base = typeof window !== "undefined" && window.location.origin ? window.location.origin : "http://localhost";
        const parsed = new URL(value, base);
        for (const key of [...parsed.searchParams.keys()]) {
            if (["agenturl", "agenttoken"].includes(key.toLowerCase())) parsed.searchParams.delete(key);
        }
        if (parsed.hash && /(?:agenturl|agenttoken|token|key|secret|password)/i.test(safeDecode(parsed.hash))) parsed.hash = "";
        const query = parsed.searchParams.toString();
        return `${parsed.pathname}${query ? `?${query}` : ""}${parsed.hash}`;
    } catch {
        return value.replace(/[?&](?:agentUrl|agentToken)=[^&#]*/gi, "").replace(/[?&]+(?=#|$)/, "");
    }
}
