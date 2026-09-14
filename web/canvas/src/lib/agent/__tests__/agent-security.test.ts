/*
Copyright (C) 2026 QuantumNous

This program is free software: you can redistribute it and/or modify
it under the terms of the GNU Affero General Public License as published by
the Free Software Foundation, either version 3 of the License, or
(at your option) any later version.

This program is distributed in the hope that it will be useful,
but WITHOUT ANY WARRANTY; without even the implied warranty of
MERCHANTABILITY or FITNESS FOR A PARTICULAR PURPOSE. See the
GNU Affero General Public License for more details.

You should have received a copy of the GNU Affero General Public License
along with this program. If not, see <https://www.gnu.org/licenses/>.
*/
import { describe, expect, test } from "vitest";

import { sanitizeAgentEndpoint, sanitizeAgentSecretText, sanitizeAgentValue, stripAgentConnectionParams, validateAgentEndpoint } from "../agent-security";

const CONNECT_TOKEN = "connect-token-123456789";
const BEARER_TOKEN = "bearer-secret-abcdef";
const JWT = "eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJzdWIiOiIxMjM0NTY3ODkwIiwibmFtZSI6IkpvaG4ifQ.signature-value";

describe("Local Agent secret redaction", () => {
    test("redacts supplied tokens and common credential forms from text", () => {
        const value = `failed with ${CONNECT_TOKEN}; Bearer ${BEARER_TOKEN}; sk-live-inline-secret; ${JWT}; https://agent.example/events?token=query-secret&clientId=client-1; Authorization: Basic basic-secret; Cookie: session=cookie-secret`;
        const sanitized = sanitizeAgentSecretText(value, [CONNECT_TOKEN]);

        expect(sanitized).not.toContain(CONNECT_TOKEN);
        expect(sanitized).not.toContain(BEARER_TOKEN);
        expect(sanitized).not.toContain("sk-live-inline-secret");
        expect(sanitized).not.toContain(JWT);
        expect(sanitized).not.toContain("query-secret");
        expect(sanitized).not.toContain("basic-secret");
        expect(sanitized).not.toContain("cookie-secret");
        expect(sanitized).toContain("[REDACTED]");
    });

    test("redacts an explicitly supplied short development token", () => {
        expect(sanitizeAgentSecretText("connect=abc", ["abc"])).toBe("connect=[REDACTED]");
    });

    test("redacts nested raw event values and credential-looking keys", () => {
        const raw = sanitizeAgentValue({
            token: CONNECT_TOKEN,
            nested: {
                authorization: `Bearer ${BEARER_TOKEN}`,
                api_key: "sk-nested-secret",
                message: `request https://agent.example/path?access_token=query-secret`,
            },
            inputTokens: 42,
        }) as Record<string, unknown>;

        expect(raw.token).toBe("[REDACTED]");
        expect((raw.nested as Record<string, unknown>).authorization).toBe("[REDACTED]");
        expect((raw.nested as Record<string, unknown>).api_key).toBe("[REDACTED]");
        expect((raw.nested as Record<string, unknown>).message).not.toContain("query-secret");
        expect(raw.inputTokens).toBe(42);
    });
});

describe("Local Agent endpoint boundary", () => {
    test("accepts a plain HTTP(S) endpoint and normalizes one trailing slash", () => {
        expect(validateAgentEndpoint("https://agent.example.local:17371/")).toEqual({ ok: true, endpoint: "https://agent.example.local:17371" });
    });

    test.each([
        "https://agent.example.local/events?token=secret",
        "https://agent.example.local/events?",
        "https://user:password@agent.example.local",
        "https://agent.example.local/events#token=secret",
        "https://agent.example.local/events#",
        "https://agent.example.local/sk-live-embedded-secret",
        "ftp://agent.example.local",
    ])("rejects credential-bearing endpoint %s", (endpoint) => {
        expect(validateAgentEndpoint(endpoint).ok).toBe(false);
    });

    test("removes userinfo, query, and fragment before displaying an endpoint", () => {
        expect(sanitizeAgentEndpoint("https://user:password@agent.example.local/events?token=secret&clientId=1#fragment")).toBe("https://agent.example.local/events");
    });
});

describe("Agent connection URL cleanup", () => {
    test("removes bootstrap Agent parameters while preserving unrelated state", () => {
        expect(stripAgentConnectionParams("https://app.example/canvas?agentUrl=https%3A%2F%2Fagent.example&agentToken=secret&tab=chat#canvas")).toBe("/canvas?tab=chat#canvas");
    });
});
