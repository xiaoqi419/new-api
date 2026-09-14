/*
Copyright (C) 2026 QuantumNous

This program is free software: you can redistribute it and/or modify
it under the terms of the GNU Affero General Public License as published by
the Free Software Foundation, either version 3 of the License, or (at your
option) any later version.

This program is distributed in the hope that it will be useful,
but WITHOUT ANY WARRANTY; without even the implied warranty of
MERCHANTABILITY or FITNESS FOR A PARTICULAR PURPOSE. See the
GNU Affero General Public License for more details.

You should have received a copy of the GNU Affero General Public License
along with this program. If not, see <https://www.gnu.org/licenses/>.
*/
import { afterEach, beforeEach, describe, expect, test, vi } from "vitest";

import { HOST_THEME_MESSAGE, HOST_TOKENS_MESSAGE, HOST_TOKENS_REQUEST_MESSAGE, initHostBridge, lockedApiBaseUrl, requestHostTokens, resetHostTokens, sanitizeHostError, useHostThemeStore, useHostTokensStore } from "../host-bridge";

type PostedMessage = {
    data: unknown;
    targetOrigin: string;
};

let parentSource: Window;
let postedMessages: PostedMessage[];
let disposeBridge: (() => void) | undefined;

function token(id: number, key: string, name = `Key ${id}`) {
    return { id, key, name };
}

function tokenRequests() {
    return postedMessages.filter((message) => (message.data as { type?: unknown }).type === HOST_TOKENS_REQUEST_MESSAGE);
}

function requestIdAt(index: number) {
    const data = tokenRequests()[index]?.data;
    return (data as { requestId?: unknown } | undefined)?.requestId;
}

function emitTokens(data: Record<string, unknown>, options: { origin?: string; source?: Window } = {}) {
    const event = new MessageEvent("message", {
        data,
        origin: options.origin ?? window.location.origin,
        source: (options.source ?? parentSource) as unknown as MessageEventSource,
    });
    window.dispatchEvent(event);
}

function emitTheme(data: Record<string, unknown>, options: { origin?: string; source?: Window } = {}) {
    const event = new MessageEvent("message", {
        data: { type: HOST_THEME_MESSAGE, ...data },
        origin: options.origin ?? window.location.origin,
        source: (options.source ?? parentSource) as unknown as MessageEventSource,
    });
    window.dispatchEvent(event);
}

function startBridge() {
    disposeBridge = initHostBridge();
    expect(disposeBridge).toBeTypeOf("function");
}

beforeEach(() => {
    postedMessages = [];
    parentSource = {
        postMessage(data: unknown, targetOrigin: string) {
            postedMessages.push({ data, targetOrigin });
        },
    } as unknown as Window;
    Object.defineProperty(window, "parent", {
        configurable: true,
        value: parentSource,
    });
    resetHostTokens();
    useHostThemeStore.setState({ theme: null });
});

afterEach(() => {
    disposeBridge?.();
    disposeBridge = undefined;
    resetHostTokens();
});

describe("embedded canvas host bridge sequencing", () => {
    test("accepts token responses only from the trusted parent origin and source", () => {
        startBridge();
        const requestId = requestHostTokens();
        expect(requestId).toBeTypeOf("string");
        expect(tokenRequests()).toHaveLength(1);
        expect(tokenRequests()[0]?.targetOrigin).toBe(window.location.origin);

        emitTokens(
            {
                type: HOST_TOKENS_MESSAGE,
                requestId,
                userId: 7,
                tokens: [token(1, "trusted")],
            },
            { origin: "https://attacker.invalid" },
        );
        expect(useHostTokensStore.getState().status).toBe("loading");

        emitTokens(
            {
                type: HOST_TOKENS_MESSAGE,
                requestId,
                userId: 7,
                tokens: [token(1, "spoofed")],
            },
            { source: {} as Window },
        );
        expect(useHostTokensStore.getState().status).toBe("loading");
        expect(useHostTokensStore.getState().tokens).toEqual([]);

        emitTokens({
            type: HOST_TOKENS_MESSAGE,
            requestId,
            userId: 7,
            tokens: [token(1, "trusted")],
        });
        expect(useHostTokensStore.getState()).toMatchObject({
            status: "ready",
            userId: 7,
            requestId,
            tokens: [{ id: 1, key: "sk-trusted", name: "Key 1" }],
        });
    });

    test("requires every theme color field before applying a host theme", () => {
        startBridge();
        const validTheme = {
            dark: false,
            vars: { "--primary": "rgb(1, 2, 3)" },
            accent: "rgb(1, 2, 3)",
            accentText: "rgb(255, 255, 255)",
            surface: "rgb(255, 255, 255)",
            text: "rgb(1, 2, 3)",
        };

        emitTheme(validTheme);
        expect(useHostThemeStore.getState().theme).toMatchObject(validTheme);

        emitTheme({ ...validTheme, accentText: undefined });
        expect(useHostThemeStore.getState().theme).toMatchObject(validTheme);

        emitTheme({ ...validTheme, text: "bad\u0001value" });
        expect(useHostThemeStore.getState().theme).toMatchObject(validTheme);
    });

    test("rejects oversized or malformed token arrays without changing account state", () => {
        startBridge();
        const requestId = requestHostTokens();
        const oversized = Array.from({ length: 101 }, (_, index) => token(index + 1, `key-${index + 1}`));

        emitTokens({ type: HOST_TOKENS_MESSAGE, requestId, userId: 7, tokens: oversized });
        expect(useHostTokensStore.getState()).toMatchObject({ status: "loading", tokens: [] });

        emitTokens({ type: HOST_TOKENS_MESSAGE, requestId, userId: 7, tokens: [token(1, "valid"), null] });
        expect(useHostTokensStore.getState()).toMatchObject({ status: "loading", tokens: [] });

        emitTokens({ type: HOST_TOKENS_MESSAGE, requestId, userId: 7, tokens: [token(1, "valid")] });
        expect(useHostTokensStore.getState()).toMatchObject({ status: "ready", userId: 7, requestId, tokens: [{ id: 1, key: "sk-valid" }] });
    });

    test("rejects oversized or control-character host errors", () => {
        startBridge();
        const requestId = requestHostTokens();

        emitTokens({ type: HOST_TOKENS_MESSAGE, requestId, userId: 7, error: "x".repeat(301) });
        expect(useHostTokensStore.getState()).toMatchObject({ status: "loading", error: "", tokens: [] });

        emitTokens({ type: HOST_TOKENS_MESSAGE, requestId, userId: 7, error: "provider failed\u0001with a malformed response" });
        expect(useHostTokensStore.getState()).toMatchObject({ status: "loading", error: "", tokens: [] });
    });

    test("redacts URLs and query credentials in accepted host errors", () => {
        startBridge();
        const requestId = requestHostTokens();
        const secret = "sk-host-error-secret";

        emitTokens({
            type: HOST_TOKENS_MESSAGE,
            requestId,
            userId: 7,
            error: `Provider request failed at https://relay.example/v1/images?api_key=${secret}; retry ?token=sess_private_token`,
        });

        const state = useHostTokensStore.getState();
        expect(state).toMatchObject({ status: "error", userId: 7, requestId, tokens: [] });
        expect(state.error).toContain("[REDACTED]");
        expect(state.error).not.toContain("relay.example");
        expect(state.error).not.toContain(secret);
        expect(state.error).not.toContain("sess_private_token");
    });

    test("rejects a response without requestId while a request is in flight", () => {
        startBridge();
        requestHostTokens();

        emitTokens({
            type: HOST_TOKENS_MESSAGE,
            userId: 7,
            tokens: [token(1, "late")],
        });

        expect(useHostTokensStore.getState()).toMatchObject({
            status: "loading",
            userId: 0,
            tokens: [],
        });
    });

    test("resets stale account state and starts a fresh request for a logged-in user", () => {
        startBridge();
        const oldRequestId = requestHostTokens();
        emitTokens({
            type: HOST_TOKENS_MESSAGE,
            requestId: oldRequestId,
            userId: 11,
            tokens: [token(1, "old-account")],
        });
        const inFlightRequestId = requestHostTokens({ force: true });
        const requestsBeforeReset = tokenRequests().length;
        expect((tokenRequests()[requestsBeforeReset - 1]?.data as { force?: unknown }).force).toBe(true);

        emitTokens({
            type: HOST_TOKENS_MESSAGE,
            requestId: "canvas-user-change-2",
            reset: true,
            userId: 22,
            tokens: [],
        });

        const stateAfterReset = useHostTokensStore.getState();
        expect(stateAfterReset).toMatchObject({
            status: "loading",
            userId: 22,
            tokens: [],
        });
        expect(stateAfterReset.requestId).not.toBe("canvas-user-change-2");
        expect(stateAfterReset.requestId).not.toBe(inFlightRequestId);
        expect(tokenRequests()).toHaveLength(requestsBeforeReset + 1);
        expect(requestIdAt(tokenRequests().length - 1)).toBe(stateAfterReset.requestId);

        emitTokens({
            type: HOST_TOKENS_MESSAGE,
            requestId: oldRequestId,
            userId: 11,
            tokens: [token(1, "late-old-account")],
        });
        expect(useHostTokensStore.getState()).toMatchObject({
            status: "loading",
            userId: 22,
            tokens: [],
        });
        expect(useHostTokensStore.getState().requestId).toBe(stateAfterReset.requestId);
    });

    test("accepts a trusted logout reset with userId zero and ignores old responses", () => {
        startBridge();
        const oldRequestId = requestHostTokens();
        emitTokens({
            type: HOST_TOKENS_MESSAGE,
            requestId: oldRequestId,
            userId: 11,
            tokens: [token(1, "account")],
        });
        const requestsBeforeLogout = tokenRequests().length;

        emitTokens({
            type: HOST_TOKENS_MESSAGE,
            requestId: "canvas-user-change-3",
            reset: true,
            userId: 0,
            tokens: [],
        });

        expect(tokenRequests()).toHaveLength(requestsBeforeLogout);
        expect(useHostTokensStore.getState()).toMatchObject({
            status: "idle",
            userId: 0,
            tokens: [],
            requestId: "",
        });

        emitTokens({
            type: HOST_TOKENS_MESSAGE,
            requestId: oldRequestId,
            userId: 11,
            tokens: [token(1, "late-account")],
        });
        expect(useHostTokensStore.getState()).toMatchObject({
            status: "idle",
            userId: 0,
            tokens: [],
            requestId: "",
        });
    });

    test("keeps the reset fence when the bridge store is cleared", () => {
        startBridge();
        const requestId = requestHostTokens();
        resetHostTokens();

        emitTokens({ type: HOST_TOKENS_MESSAGE, userId: 7, tokens: [token(1, "late-account")] });
        expect(useHostTokensStore.getState()).toMatchObject({ status: "idle", userId: 0, requestId: "", tokens: [] });

        // A fresh request explicitly opens a new correlation window.
        const nextRequestId = requestHostTokens();
        expect(nextRequestId).not.toBe(requestId);
        emitTokens({ type: HOST_TOKENS_MESSAGE, requestId: nextRequestId, userId: 7, tokens: [token(1, "fresh-account")] });
        expect(useHostTokensStore.getState()).toMatchObject({ status: "ready", userId: 7, requestId: nextRequestId });
    });

    test("keeps the logout fence when a delayed response omits requestId", () => {
        startBridge();
        const oldRequestId = requestHostTokens();
        emitTokens({
            type: HOST_TOKENS_MESSAGE,
            requestId: oldRequestId,
            userId: 11,
            tokens: [token(1, "account")],
        });

        emitTokens({
            type: HOST_TOKENS_MESSAGE,
            requestId: "canvas-user-change-logout-no-id",
            reset: true,
            userId: 0,
            tokens: [],
        });
        emitTokens({
            type: HOST_TOKENS_MESSAGE,
            userId: 11,
            tokens: [token(1, "late-account")],
        });

        expect(useHostTokensStore.getState()).toMatchObject({
            status: "idle",
            userId: 0,
            tokens: [],
            requestId: "",
        });
    });

    test("accepts legacy prefix resets but ignores duplicate reset delivery", () => {
        startBridge();
        const oldRequestId = requestHostTokens();
        emitTokens({
            type: HOST_TOKENS_MESSAGE,
            requestId: oldRequestId,
            userId: 11,
            tokens: [token(1, "account")],
        });
        const requestsBeforeReset = tokenRequests().length;

        emitTokens({
            type: HOST_TOKENS_MESSAGE,
            requestId: "canvas-user-change-legacy",
            userId: 22,
            tokens: [],
        });
        const stateAfterReset = useHostTokensStore.getState();
        expect(stateAfterReset.status).toBe("loading");
        expect(stateAfterReset.userId).toBe(22);
        expect(tokenRequests()).toHaveLength(requestsBeforeReset + 1);

        emitTokens({
            type: HOST_TOKENS_MESSAGE,
            requestId: "canvas-user-change-legacy",
            userId: 22,
            tokens: [],
        });
        expect(tokenRequests()).toHaveLength(requestsBeforeReset + 1);
        expect(useHostTokensStore.getState().requestId).toBe(stateAfterReset.requestId);
    });

    test("rejects malformed explicit resets", () => {
        startBridge();
        const requestId = requestHostTokens();
        emitTokens({
            type: HOST_TOKENS_MESSAGE,
            requestId: "reset-without-user",
            reset: true,
            tokens: [],
        });
        expect(useHostTokensStore.getState().status).toBe("loading");

        emitTokens({
            type: HOST_TOKENS_MESSAGE,
            requestId,
            reset: "yes",
            userId: 7,
            tokens: [],
        });
        expect(useHostTokensStore.getState().status).toBe("loading");
    });

    test("fails closed for an opaque embedded origin", () => {
        const originalWindow = globalThis.window;
        const opaqueWindow = {
            parent: {},
            location: { origin: "null" },
        } as unknown as Window & typeof globalThis;
        vi.stubGlobal("window", opaqueWindow);
        expect(lockedApiBaseUrl()).toBe("");
        expect(requestHostTokens()).toBe("");
        vi.stubGlobal("window", originalWindow);
    });

    test("rejects a same-request response that belongs to another user", () => {
        startBridge();
        const requestId = requestHostTokens();
        emitTokens({
            type: HOST_TOKENS_MESSAGE,
            requestId,
            userId: 11,
            tokens: [token(1, "account")],
        });

        emitTokens({
            type: HOST_TOKENS_MESSAGE,
            requestId,
            userId: 22,
            tokens: [token(2, "wrong-account")],
        });

        expect(useHostTokensStore.getState()).toMatchObject({
            status: "ready",
            userId: 11,
            requestId,
            tokens: [{ id: 1, key: "sk-account", name: "Key 1" }],
        });
    });
});

describe("host error sanitization", () => {
    test.each([
        ["Cookie: session=private-cookie", "private-cookie"],
        ["Proxy-Authorization: Basic private-proxy", "private-proxy"],
        ["provider returned rk-private-key", "rk-private-key"],
        ["provider returned pk_private_key", "pk_private_key"],
        ["provider returned sess_private_session", "sess_private_session"],
        [`provider returned AIza${"A".repeat(24)}`, `AIza${"A".repeat(24)}`],
    ])("redacts %s", (message, secret) => {
        const sanitized = sanitizeHostError(message);

        expect(sanitized).toContain("[REDACTED]");
        expect(sanitized).not.toContain(secret);
    });

    test("redacts explicit secrets and their encoded forms", () => {
        const secret = "tenant/key with spaces";
        const sanitized = sanitizeHostError(`failed for ${secret} and ${encodeURIComponent(secret)}`, [secret]);

        expect(sanitized.match(/\[REDACTED\]/g)).toHaveLength(2);
        expect(sanitized).not.toContain("tenant/key");
        expect(sanitized).not.toContain("tenant%2Fkey");
    });

    test("replaces raw HTML errors with the generic sentinel", () => {
        expect(sanitizeHostError("<!doctype html><script>credential</script>")).toBe("请求失败");
    });
});
