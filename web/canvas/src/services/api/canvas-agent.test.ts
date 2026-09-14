import { beforeEach, describe, expect, test, vi } from "vitest";

import { agentRequestUrl, fetchAgentMessageAsset, fetchAgentRequest, isAgentMessageAsset, openAgentEventStream } from "./canvas-agent";

describe("canvas Agent request security", () => {
    beforeEach(() => {
        vi.restoreAllMocks();
    });

    test("keeps endpoint base paths while rejecting traversal and credential query keys", () => {
        expect(agentRequestUrl("http://127.0.0.1:17371", "/events?clientId=abc")).toBe("http://127.0.0.1:17371/events?clientId=abc");
        expect(agentRequestUrl("https://agent.example.test/connect/", "/events", { clientId: "abc" })).toBe("https://agent.example.test/connect/events?clientId=abc");
        expect(() => agentRequestUrl("https://agent.example.test/connect", "/../events")).toThrow();
        expect(() => agentRequestUrl("https://agent.example.test/connect", "/%2e%2e/events")).toThrow();
        expect(() => agentRequestUrl("https://agent.example.test/connect", "//evil.example/events")).toThrow();
        expect(() => agentRequestUrl("https://agent.example.test/connect", "/events#token=secret")).toThrow();
        expect(() => agentRequestUrl("https://agent.example.test/connect", "/events?token=secret")).toThrow();
        expect(() => agentRequestUrl("https://agent.example.test/connect", "/events", { apiKey: "secret" })).toThrow();
    });

    test("sends the Agent token in a header and never appends it to the URL", async () => {
        const fetchMock = vi.spyOn(globalThis, "fetch").mockResolvedValue(new Response("{}", { status: 200 }));
        const response = await fetchAgentRequest("http://127.0.0.1:17371", "secret-token", "/config");
        expect(response.ok).toBe(true);
        const [url, init] = fetchMock.mock.calls[0] as [string, RequestInit];
        expect(url).toBe("http://127.0.0.1:17371/config");
        expect(url).not.toContain("secret-token");
        expect(new Headers(init.headers).get("x-canvas-agent-token")).toBe("secret-token");
    });

    test("fetches opaque message assets with header authentication", async () => {
        const marker = `agent-asset:${"a".repeat(64)}/${"b".repeat(64)}.png`;
        expect(isAgentMessageAsset(marker)).toBe(true);
        const fetchMock = vi.spyOn(globalThis, "fetch").mockResolvedValue(new Response(new Blob(["image"]), { status: 200 }));
        const blob = await fetchAgentMessageAsset("http://127.0.0.1:17371", "secret-token", marker);
        expect(blob).toBeInstanceOf(Blob);
        const [url, init] = fetchMock.mock.calls[0] as [string, RequestInit];
        expect(url).toContain(`/agent/message-assets/${"a".repeat(64)}/${"b".repeat(64)}.png`);
        expect(url).not.toContain("secret-token");
        expect(new Headers(init.headers).get("x-canvas-agent-token")).toBe("secret-token");
    });

    test("parses CRLF, CR, multiline data, and a final unterminated SSE event", async () => {
        const streamBody = new ReadableStream<Uint8Array>({
            start(controller) {
                const encoder = new TextEncoder();
                controller.enqueue(encoder.encode("event: hello\rdata: first\r\ndata: second\r\n\r\ndata: final"));
                controller.close();
            },
        });
        vi.spyOn(globalThis, "fetch").mockResolvedValue(new Response(streamBody, { status: 200, headers: { "content-type": "text/event-stream" } }));
        const events: string[] = [];
        const source = openAgentEventStream("http://127.0.0.1:17371", "secret-token", "client");
        source.addEventListener("hello", (event) => events.push(`hello:${event.data}`));
        source.addEventListener("message", (event) => events.push(`message:${event.data}`));
        await new Promise((resolve) => setTimeout(resolve, 0));
        expect(events).toEqual(["hello:first\nsecond", "message:final"]);
        source.close();
    });
});
