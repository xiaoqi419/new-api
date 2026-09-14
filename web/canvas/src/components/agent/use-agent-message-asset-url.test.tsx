import { renderHook, waitFor } from "@testing-library/react";
import { afterEach, beforeEach, describe, expect, test, vi } from "vitest";

import { useAgentMessageAssetUrl } from "./use-agent-message-asset-url";

describe("useAgentMessageAssetUrl", () => {
    beforeEach(() => {
        vi.restoreAllMocks();
    });

    afterEach(() => {
        vi.unstubAllGlobals();
    });

    test("loads protected assets with an object URL and revokes it on unmount", async () => {
        const marker = `agent-asset:${"a".repeat(64)}/${"b".repeat(64)}.png`;
        vi.spyOn(globalThis, "fetch").mockResolvedValue(new Response(new Blob(["image/png"]), { status: 200 }));
        const createObjectUrl = vi.spyOn(URL, "createObjectURL").mockReturnValue("blob:agent-preview");
        const revokeObjectUrl = vi.spyOn(URL, "revokeObjectURL").mockImplementation(() => undefined);

        const { result, unmount } = renderHook(() => useAgentMessageAssetUrl("http://127.0.0.1:17371", "secret-token", marker));
        await waitFor(() => expect(result.current).toBe("blob:agent-preview"));
        expect(createObjectUrl).toHaveBeenCalledTimes(1);
        unmount();
        expect(revokeObjectUrl).toHaveBeenCalledWith("blob:agent-preview");
    });

    test("does not expose malformed Agent asset references to the DOM", () => {
        const { result } = renderHook(() => useAgentMessageAssetUrl("http://127.0.0.1:17371", "secret-token", "agent-asset:malformed"));
        expect(result.current).toBe("");
    });
});
