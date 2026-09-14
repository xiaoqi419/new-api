import { describe, expect, it } from "vitest";

import { migrateCanvasPersistedState } from "@/lib/canvas/canvas-data-migration";
import { CanvasNodeType, type CanvasNodeData } from "@/types/canvas";

const imageNode = (id: string, content: string, extraMetadata: Record<string, unknown> = {}): CanvasNodeData => ({
    id,
    type: CanvasNodeType.Image,
    title: id,
    position: { x: 0, y: 0 },
    width: 320,
    height: 240,
    metadata: {
        content,
        status: "success",
        naturalWidth: 320,
        naturalHeight: 240,
        mimeType: "image/png",
        bytes: content.length,
        ...extraMetadata,
    },
});

const validProject = (overrides: Record<string, unknown> = {}): Record<string, unknown> => ({
    id: "p",
    title: "P",
    createdAt: "2026-01-01",
    updatedAt: "2026-01-01",
    nodes: [],
    connections: [],
    chatSessions: [],
    activeChatId: null,
    backgroundMode: "lines",
    showImageInfo: false,
    viewport: { x: 0, y: 0, k: 1 },
    ...overrides,
});

describe("migrateCanvasPersistedState", () => {
    it("keeps a v0.12 single image and defaults deletedProjects", () => {
        const single = imageNode("single", "data:image/png;base64,AAAA");
        const result = migrateCanvasPersistedState({
            projects: [{ id: "p", title: "P", createdAt: "2026-01-01", updatedAt: "2026-01-01", nodes: [single], connections: [], chatSessions: [], activeChatId: null, backgroundMode: "lines", showImageInfo: false, viewport: { x: 0, y: 0, k: 1 } }],
        });

        expect(result.migrated).toBe(true);
        expect(result.state.deletedProjects).toEqual([]);
        expect(result.state.projects[0].nodes).toEqual([single]);
    });

    it("collapses a legacy batch into root.metadata.images and removes presentation children", () => {
        const childA = imageNode("child-a", "data:image/png;base64,AAAA", { storageKey: "img-a", batchRootId: "root" });
        const childB = imageNode("child-b", "data:image/png;base64,BBBB", { status: "error", errorDetails: "upstream failed", batchRootId: "root" });
        const root = imageNode("root", "data:image/png;base64,AAAA", {
            isBatchRoot: true,
            batchChildIds: ["child-a", "child-b"],
            primaryImageId: "child-b",
            batchUsesReferenceImages: true,
            imageBatchExpanded: true,
            references: ["img-ref"],
        });
        const sourceState = {
            projects: [
                {
                    id: "p",
                    title: "P",
                    createdAt: "2026-01-01",
                    updatedAt: "2026-01-01",
                    nodes: [imageNode("source", "data:image/png;base64,SOURCE"), root, childA, childB, { ...imageNode("unrelated", "data:image/png;base64,CCCC"), metadata: { ...imageNode("unrelated", "").metadata, batchRootId: "missing-root" } }],
                    connections: [
                        { id: "source-root", fromNodeId: "source", toNodeId: "root" },
                        { id: "root-a", fromNodeId: "root", toNodeId: "child-a" },
                        { id: "root-b", fromNodeId: "root", toNodeId: "child-b" },
                    ],
                    chatSessions: [],
                    activeChatId: null,
                    backgroundMode: "lines",
                    showImageInfo: false,
                    viewport: { x: 0, y: 0, k: 1 },
                },
            ],
        };
        const result = migrateCanvasPersistedState(sourceState);

        const project = result.state.projects[0];
        const migratedRoot = project.nodes.find((node) => node.id === "root");
        expect(result.migrated).toBe(true);
        expect(project.nodes.map((node) => node.id)).toEqual(["source", "root", "unrelated"]);
        expect(migratedRoot?.metadata?.images?.map((image) => image.id)).toEqual(["child-a", "child-b"]);
        expect(migratedRoot?.metadata?.primaryImageId).toBe("child-b");
        expect(migratedRoot?.metadata?.content).toBe("data:image/png;base64,BBBB");
        expect(migratedRoot?.metadata?.references).toEqual(["img-ref"]);
        expect(project.connections).toEqual([{ id: "source-root", fromNodeId: "source", toNodeId: "root" }]);
        expect((migratedRoot?.metadata as Record<string, unknown>).batchChildIds).toBeUndefined();
        expect((migratedRoot?.metadata as Record<string, unknown>).isBatchRoot).toBeUndefined();
        expect(sourceState.projects[0].nodes).toHaveLength(5);
    });

    it("does not alter text, config, plugin, or already-migrated nodes", () => {
        const text: CanvasNodeData = {
            id: "text",
            type: CanvasNodeType.Text,
            title: "Text",
            position: { x: 10, y: 10 },
            width: 200,
            height: 100,
            metadata: { content: "hello", texts: [{ id: "t", status: "success", content: "hello" }], primaryTextId: "t" },
        };
        const plugin: CanvasNodeData = { id: "plugin", type: "demo:node", title: "Plugin", position: { x: 0, y: 0 }, width: 100, height: 100, metadata: { interactive: true, groupId: "group" } };
        const state = {
            projects: [{ id: "p", title: "P", createdAt: "2026-01-01", updatedAt: "2026-01-01", nodes: [text, plugin], connections: [], chatSessions: [], activeChatId: null, backgroundMode: "lines", showImageInfo: false, viewport: { x: 0, y: 0, k: 1 } }],
            deletedProjects: [{ id: "old", deletedAt: "2026-01-01" }],
        };
        const result = migrateCanvasPersistedState(state);

        expect(result.migrated).toBe(false);
        expect(result.state.projects[0].nodes).toEqual([text, plugin]);
        expect(result.state.deletedProjects).toEqual(state.deletedProjects);
    });

    it("rejects malformed persisted payloads before they can be written back", () => {
        expect(() => migrateCanvasPersistedState({ projects: null })).toThrowError(/persisted state\.projects is missing or invalid/);
        expect(() => migrateCanvasPersistedState({ projects: [null] })).toThrowError(/project 0 is invalid/);
        expect(() => migrateCanvasPersistedState({ projects: [{ nodes: [], connections: "bad" }] })).toThrowError(/project\.connections is not an array/);
        expect(() => migrateCanvasPersistedState({ projects: [validProject({ id: "" })] })).toThrowError(/project\.id is missing or invalid/);
    });

    it("rejects projects missing required metadata instead of hydrating unusable records", () => {
        const requiredFields = ["id", "title", "createdAt", "updatedAt"];
        for (const field of requiredFields) {
            const project = validProject();
            delete project[field];
            expect(() => migrateCanvasPersistedState({ projects: [project] })).toThrowError(new RegExp(`project\\.${field} is missing or invalid`));
        }
    });

    it("rejects invalid project options and viewport transforms", () => {
        const invalidCases: Array<[string, Record<string, unknown>]> = [
            ["chatSessions is not an array", { chatSessions: {} }],
            ["activeChatId is not a string or null", { activeChatId: 42 }],
            ["backgroundMode is invalid", { backgroundMode: "grid" }],
            ["showImageInfo is not a boolean", { showImageInfo: "false" }],
            ["viewport is invalid", { viewport: { x: Number.NaN, y: 0, k: 1 } }],
            ["viewport is invalid", { viewport: { x: 0, y: 0, k: 0 } }],
            ["viewport is invalid", { viewport: { x: 0, y: 0 } }],
        ];

        for (const [message, overrides] of invalidCases) {
            expect(() => migrateCanvasPersistedState({ projects: [validProject(overrides)] })).toThrowError(new RegExp(message.replace(/[.*+?^${}()|[\]\\]/g, "\\$&")));
        }
    });

    it("fails closed for malformed deleted project records", () => {
        expect(() => migrateCanvasPersistedState({ projects: [validProject()], deletedProjects: "bad" })).toThrowError(/persisted state\.deletedProjects is not an array/);
        expect(() => migrateCanvasPersistedState({ projects: [validProject()], deletedProjects: [null] })).toThrowError(/deleted project 0 is invalid/);
        expect(() => migrateCanvasPersistedState({ projects: [validProject()], deletedProjects: [{ id: "", deletedAt: "2026-01-01" }] })).toThrowError(/deleted project 0 is invalid/);
        expect(() => migrateCanvasPersistedState({ projects: [validProject()], deletedProjects: [{ id: "old", deletedAt: 0 }] })).toThrowError(/deleted project 0 is invalid/);
    });

    it("does not mutate malformed persisted data when validation fails", () => {
        const invalidProjectState = { projects: [validProject({ createdAt: undefined })], deletedProjects: [] };
        const invalidProjectSnapshot = structuredClone(invalidProjectState);
        expect(() => migrateCanvasPersistedState(invalidProjectState)).toThrowError(/project\.createdAt is missing or invalid/);
        expect(invalidProjectState).toEqual(invalidProjectSnapshot);

        const invalidDeletedState = { projects: [validProject()], deletedProjects: [{ id: "", deletedAt: "2026-01-01" }] };
        const invalidDeletedSnapshot = structuredClone(invalidDeletedState);
        expect(() => migrateCanvasPersistedState(invalidDeletedState)).toThrowError(/deleted project 0 is invalid/);
        expect(invalidDeletedState).toEqual(invalidDeletedSnapshot);
    });

    it("fails closed when a legacy batch cannot be converted without losing an image", () => {
        const root = imageNode("root", "", { isBatchRoot: true, batchChildIds: ["missing"] });
        const project = { id: "p", title: "P", createdAt: "2026-01-01", updatedAt: "2026-01-01", nodes: [root], connections: [], chatSessions: [], activeChatId: null, backgroundMode: "lines", showImageInfo: false, viewport: { x: 0, y: 0, k: 1 } };
        expect(() => migrateCanvasPersistedState({ projects: [project] })).toThrowError(/legacy batch root root references a missing child/);
        expect(project.nodes).toEqual([root]);
    });

    it("rejects legacy batches whose child nodes have user connections", () => {
        const root = imageNode("root", "", { isBatchRoot: true, batchChildIds: ["child"] });
        const child = imageNode("child", "data:image/png;base64,AAAA", { batchRootId: "root" });
        const project = {
            id: "p",
            title: "P",
            createdAt: "2026-01-01",
            updatedAt: "2026-01-01",
            nodes: [root, child, imageNode("other", "data:image/png;base64,BBBB")],
            connections: [{ id: "external", fromNodeId: "child", toNodeId: "other" }],
            chatSessions: [],
            activeChatId: null,
            backgroundMode: "lines",
            showImageInfo: false,
            viewport: { x: 0, y: 0, k: 1 },
        };
        expect(() => migrateCanvasPersistedState({ projects: [project] })).toThrowError(/legacy batch child child has an external connection/);
    });
});
