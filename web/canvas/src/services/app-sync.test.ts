import { describe, expect, it } from "vitest";

import { mergeCanvasData } from "@/services/app-sync";
import { CanvasNodeType, type CanvasNodeData } from "@/types/canvas";

const imageNode = (id: string, content: string, metadata: Record<string, unknown> = {}): CanvasNodeData => ({
    id,
    type: CanvasNodeType.Image,
    title: id,
    position: { x: 0, y: 0 },
    width: 320,
    height: 240,
    metadata: { content, status: "success", naturalWidth: 320, naturalHeight: 240, mimeType: "image/png", bytes: content.length, ...metadata },
});

describe("mergeCanvasData", () => {
    it("migrates legacy remote batches before merging WebDAV data", () => {
        const root = imageNode("root", "", { isBatchRoot: true, batchChildIds: ["child"] });
        const child = imageNode("child", "data:image/png;base64,AAAA", { batchRootId: "root" });
        const merged = mergeCanvasData(
            { projects: [], deleted: [] },
            {
                projects: [
                    { id: "p", title: "Remote", createdAt: "2026-01-01", updatedAt: "2026-01-01", nodes: [root, child], connections: [], chatSessions: [], activeChatId: null, backgroundMode: "lines", showImageInfo: false, viewport: { x: 0, y: 0, k: 1 } },
                ],
                deleted: [],
            },
        );

        expect(merged.projects[0].nodes).toHaveLength(1);
        expect(merged.projects[0].nodes[0].metadata?.images?.[0].id).toBe("child");
    });

    it("rejects an unsafe remote batch before merge output is produced", () => {
        const root = imageNode("root", "", { isBatchRoot: true, batchChildIds: ["missing"] });
        expect(() =>
            mergeCanvasData(
                { projects: [], deleted: [] },
                {
                    projects: [
                        { id: "p", title: "Remote", createdAt: "2026-01-01", updatedAt: "2026-01-01", nodes: [root], connections: [], chatSessions: [], activeChatId: null, backgroundMode: "lines", showImageInfo: false, viewport: { x: 0, y: 0, k: 1 } },
                    ],
                    deleted: [],
                },
            ),
        ).toThrowError(/legacy batch root root references a missing child/);
    });
});
