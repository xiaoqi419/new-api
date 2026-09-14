/**
 * Small, browser-independent helpers shared by the embedded host bridge and
 * bootstrap.  Keeping these rules in one place is important: a token returned
 * by the dashboard must have the same representation when it is compared with
 * a persisted Canvas configuration, and an upstream error must never echo a
 * credential back into the iframe UI.
 */

export type HostTokenContract = {
    id: number;
    name: string;
    key: string;
};

const MAX_TOKEN_LENGTH = 512;
const MAX_ERROR_LENGTH = 300;
const REDACTED_HOST_SECRET = "[REDACTED]";

/** Return the canonical relay representation without ever adding `sk-` twice. */
export function normalizeRelayKey(value: unknown): string {
    if (typeof value !== "string") return "";
    const trimmed = value.trim();
    if (!trimmed || trimmed.length > MAX_TOKEN_LENGTH) return "";
    const body = trimmed.replace(/^(?:sk-)+/i, "");
    return body ? `sk-${body}` : "";
}

export function normalizeHostUserId(value: unknown): number {
    const id = typeof value === "number" ? value : Number(value);
    return Number.isSafeInteger(id) && id > 0 ? id : 0;
}

export function parseHostToken(value: unknown): HostTokenContract | null {
    if (!value || typeof value !== "object") return null;
    const item = value as Record<string, unknown>;
    const id = normalizeHostUserId(item.id);
    const key = normalizeRelayKey(item.key);
    if (!id || !key) return null;
    const rawName = typeof item.name === "string" ? item.name.trim() : "";
    return {
        id,
        name: rawName.slice(0, 120) || "未命名令牌",
        key,
    };
}

/**
 * Redact known secrets first, then cover the common bearer, relay-key and JWT
 * forms.  Error strings are intentionally capped before they reach React or
 * postMessage so an upstream HTML page cannot flood the UI.
 */
export function sanitizeHostError(value: unknown, secrets: readonly string[] = []): string {
    let text = typeof value === "string" ? value : value instanceof Error ? value.message : "";
    text = text.trim();
    if (!text) return "请求失败";

    // A failed upstream request can contain a full HTML error document. Keep
    // the bridge response bounded and textual even when an older host sends
    // the raw document instead of sanitizing it first.
    if (/<(?:!doctype|html|head|body|title|script|style)\b/i.test(text)) return "请求失败";

    const uniqueSecrets = Array.from(
        new Set(
            secrets
                .filter((secret): secret is string => typeof secret === "string")
                .map((secret) => secret.trim())
                .filter((secret) => secret.length >= 4),
        ),
    ).sort((a, b) => b.length - a.length);
    for (const secret of uniqueSecrets) {
        const variants = new Set([secret]);
        try {
            variants.add(encodeURIComponent(secret));
        } catch {
            // Keep redacting the original value if it is not URI encodable.
        }
        for (const variant of variants) text = text.split(variant).join(REDACTED_HOST_SECRET);
    }

    text = text
        .replace(/(?:https?|wss?|ftp):\/\/[^\s<>"'`]+/gi, REDACTED_HOST_SECRET)
        .replace(/(?:blob|data):[^\s<>"'`]+/gi, REDACTED_HOST_SECRET)
        .replace(/Bearer\s+[^\s,;)}\]]+/gi, `Bearer ${REDACTED_HOST_SECRET}`)
        .replace(/([?&](?:api[_-]?key|key|token|access[_-]?token|secret|password|authorization|proxy-authorization|cookie|set-cookie)=)[^&#\s"'<>]+/gi, `$1${REDACTED_HOST_SECRET}`)
        .replace(/(?:authorization|proxy-authorization)\s*[:=]\s*(?:[A-Za-z]+\s+)?[^\s,;\]}]+/gi, REDACTED_HOST_SECRET)
        .replace(/(?:["']?(?:cookie|set-cookie)["']?)\s*[:=]\s*"?[^,\r\n}\"']+/gi, REDACTED_HOST_SECRET)
        .replace(/((?:x-api-key|api[_-]?key)\s*[:=]\s*)(?:[A-Za-z]+\s+)?[^\s,;\]}]+/gi, `$1${REDACTED_HOST_SECRET}`)
        .replace(/((?:"?(?:api[_-]?key|key|token|access[_-]?token|secret|password)"?)\s*[:=]\s*"?)[^\s,"'}]+/gi, `$1${REDACTED_HOST_SECRET}`)
        .replace(/\b(?:sk|rk|pk)-[A-Za-z0-9][A-Za-z0-9._~-]*\b/gi, REDACTED_HOST_SECRET)
        .replace(/\b(?:sk|rk|pk)_[A-Za-z0-9][A-Za-z0-9._-]*\b/gi, REDACTED_HOST_SECRET)
        .replace(/\bsess_[A-Za-z0-9][A-Za-z0-9._-]*\b/gi, REDACTED_HOST_SECRET)
        .replace(/\bAIza[0-9A-Za-z_-]{20,}\b/gi, REDACTED_HOST_SECRET)
        .replace(/\beyJ[A-Za-z0-9_-]*\.[A-Za-z0-9._-]+\.[A-Za-z0-9._-]+\b/g, REDACTED_HOST_SECRET);

    return text.slice(0, MAX_ERROR_LENGTH) || "请求失败";
}
