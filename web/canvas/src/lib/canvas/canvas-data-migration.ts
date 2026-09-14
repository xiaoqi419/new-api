import type { CanvasDeletedProject, CanvasProject } from "@/stores/canvas/use-canvas-store";
import type { CanvasNodeData, CanvasNodeImage, CanvasNodeMetadata } from "@/types/canvas";

/**
 * The v0.12 canvas represented an image batch as one root node plus one child
 * node per generated image.  v0.18 stores those images on the root node in an
 * `images` array.  Zustand does not run a migration callback for this store,
 * so old records need to be normalized while they are read.
 */
export type CanvasPersistedState = {
    projects: CanvasProject[];
    deletedProjects: CanvasDeletedProject[];
};

export type CanvasMigrationResult = {
    state: CanvasPersistedState;
    migrated: boolean;
};

const legacyBatchFields = ["isBatchRoot", "batchRootId", "batchChildIds", "batchUsesReferenceImages", "imageBatchExpanded"] as const;

type UnknownRecord = Record<string, unknown>;
type LegacyCanvasNodeMetadata = CanvasNodeMetadata & {
    isBatchRoot?: boolean;
    batchRootId?: string;
    batchChildIds?: string[];
    batchUsesReferenceImages?: boolean;
    imageBatchExpanded?: boolean;
};

function legacyMetadata(node: CanvasNodeData): LegacyCanvasNodeMetadata | undefined {
    return node.metadata as LegacyCanvasNodeMetadata | undefined;
}

function isRecord(value: unknown): value is UnknownRecord {
    return typeof value === "object" && value !== null && !Array.isArray(value);
}

function isNonEmptyString(value: unknown): value is string {
    return typeof value === "string" && value.trim().length > 0;
}

function isFiniteNumber(value: unknown): value is number {
    return typeof value === "number" && Number.isFinite(value);
}

function validateChatSessions(value: unknown): asserts value is CanvasProject["chatSessions"] {
    if (!Array.isArray(value)) throw new Error("Canvas data migration failed: project.chatSessions is not an array");
    value.forEach((session, index) => {
        if (!isRecord(session)) throw new Error(`Canvas data migration failed: project.chatSessions[${index}] is invalid`);
        if (!isNonEmptyString(session.id)) throw new Error(`Canvas data migration failed: project.chatSessions[${index}].id is missing or invalid`);
        if (typeof session.title !== "string") throw new Error(`Canvas data migration failed: project.chatSessions[${index}].title is invalid`);
        if (!isNonEmptyString(session.createdAt)) throw new Error(`Canvas data migration failed: project.chatSessions[${index}].createdAt is missing or invalid`);
        if (!isNonEmptyString(session.updatedAt)) throw new Error(`Canvas data migration failed: project.chatSessions[${index}].updatedAt is missing or invalid`);
        if (!Array.isArray(session.messages)) throw new Error(`Canvas data migration failed: project.chatSessions[${index}].messages is not an array`);
        session.messages.forEach((message, messageIndex) => {
            if (!isRecord(message) || !isNonEmptyString(message.id) || typeof message.text !== "string") {
                throw new Error(`Canvas data migration failed: project.chatSessions[${index}].messages[${messageIndex}] is invalid`);
            }
            if (!["user", "assistant", "system", "tool", "error"].includes(message.role as string)) {
                throw new Error(`Canvas data migration failed: project.chatSessions[${index}].messages[${messageIndex}].role is invalid`);
            }
        });
    });
}

function validateProjectShape(project: UnknownRecord): asserts project is CanvasProject {
    // Keep the node/connection checks first so malformed legacy payloads report
    // the same actionable error before any migration work starts.
    if (!Array.isArray(project.nodes)) throw new Error("Canvas data migration failed: project.nodes is not an array");
    if (!Array.isArray(project.connections)) throw new Error("Canvas data migration failed: project.connections is not an array");
    if (!isNonEmptyString(project.id)) throw new Error("Canvas data migration failed: project.id is missing or invalid");
    if (!isNonEmptyString(project.title)) throw new Error("Canvas data migration failed: project.title is missing or invalid");
    if (!isNonEmptyString(project.createdAt)) throw new Error("Canvas data migration failed: project.createdAt is missing or invalid");
    if (!isNonEmptyString(project.updatedAt)) throw new Error("Canvas data migration failed: project.updatedAt is missing or invalid");
    validateChatSessions(project.chatSessions);
    if (project.activeChatId !== null && !isNonEmptyString(project.activeChatId)) {
        throw new Error("Canvas data migration failed: project.activeChatId is not a string or null");
    }
    if (project.backgroundMode !== "dots" && project.backgroundMode !== "lines" && project.backgroundMode !== "blank") {
        throw new Error("Canvas data migration failed: project.backgroundMode is invalid");
    }
    if (typeof project.showImageInfo !== "boolean") throw new Error("Canvas data migration failed: project.showImageInfo is not a boolean");
    if (!isRecord(project.viewport) || !isFiniteNumber(project.viewport.x) || !isFiniteNumber(project.viewport.y) || !isFiniteNumber(project.viewport.k) || project.viewport.k <= 0) {
        throw new Error("Canvas data migration failed: project.viewport is invalid");
    }
}

function imageFromLegacyNode(node: CanvasNodeData): CanvasNodeImage {
    const metadata = node.metadata || {};
    return {
        id: node.id,
        status: metadata.status || (metadata.content ? "success" : "error"),
        errorDetails: metadata.errorDetails,
        content: metadata.content || "",
        storageKey: metadata.storageKey,
        naturalWidth: metadata.naturalWidth || 0,
        naturalHeight: metadata.naturalHeight || 0,
        bytes: metadata.bytes || 0,
        mimeType: metadata.mimeType || "image/png",
    };
}

function withoutLegacyBatchFields(metadata: CanvasNodeMetadata): CanvasNodeMetadata {
    const normalized = { ...metadata } as UnknownRecord;
    for (const field of legacyBatchFields) delete normalized[field];
    return normalized as CanvasNodeMetadata;
}

function migrateLegacyBatch(root: CanvasNodeData, childrenById: Map<string, CanvasNodeData>): { node: CanvasNodeData; removedChildIds: Set<string>; changed: boolean } {
    const metadata = legacyMetadata(root);
    if (!metadata?.isBatchRoot) return { node: root, removedChildIds: new Set(), changed: false };

    if (!Array.isArray(metadata.batchChildIds) || metadata.batchChildIds.length === 0) {
        throw new Error(`Canvas data migration failed: legacy batch root ${root.id} has no child list`);
    }
    const childIds = metadata.batchChildIds.filter((id): id is string => typeof id === "string");
    if (childIds.length !== metadata.batchChildIds.length || new Set(childIds).size !== childIds.length) {
        throw new Error(`Canvas data migration failed: legacy batch root ${root.id} has an invalid child list`);
    }
    const children = childIds.map((id) => childrenById.get(id));
    if (children.some((node) => !node)) throw new Error(`Canvas data migration failed: legacy batch root ${root.id} references a missing child`);
    if (children.some((node) => node?.type !== "image" || legacyMetadata(node)?.batchRootId !== root.id)) {
        throw new Error(`Canvas data migration failed: legacy batch root ${root.id} references an invalid child`);
    }
    if (children.some((node) => node && legacyMetadata(node)?.groupId)) {
        throw new Error(`Canvas data migration failed: legacy batch root ${root.id} has a grouped child`);
    }
    const images = children.filter((node): node is CanvasNodeData => Boolean(node)).map(imageFromLegacyNode);

    // A root normally had no content in v0.12.  Keep it when the child record
    // is missing (or when a manually-created root did contain an image).
    const primaryChildId = typeof metadata.primaryImageId === "string" && images.some((image) => image.id === metadata.primaryImageId) ? metadata.primaryImageId : images[0]?.id;
    if (!images.length && metadata.content) images.push(imageFromLegacyNode(root));
    if (typeof metadata.primaryImageId === "string" && !childIds.includes(metadata.primaryImageId)) {
        throw new Error(`Canvas data migration failed: legacy batch root ${root.id} has an invalid primary image`);
    }
    const primaryImage = images.find((image) => image.id === primaryChildId) || images[0];
    if (primaryImage && metadata.content && !primaryImage.content) {
        const rootImage = imageFromLegacyNode(root);
        Object.assign(primaryImage, rootImage, { id: primaryImage.id });
    }
    const normalizedMetadata = withoutLegacyBatchFields(metadata);
    if (images.length) {
        normalizedMetadata.images = images;
        normalizedMetadata.primaryImageId = primaryImage?.id;
        normalizedMetadata.count = images.length;
        // v0.18 still uses these scalar fields for the normal single-image
        // renderer and for retry/reference resolution.
        if (primaryImage) {
            normalizedMetadata.content = primaryImage.content;
            normalizedMetadata.storageKey = primaryImage.storageKey;
            normalizedMetadata.naturalWidth = primaryImage.naturalWidth;
            normalizedMetadata.naturalHeight = primaryImage.naturalHeight;
            normalizedMetadata.bytes = primaryImage.bytes;
            normalizedMetadata.mimeType = primaryImage.mimeType;
        }
    }

    const removedChildIds = new Set(childIds.filter((id) => childrenById.has(id)));
    return { node: { ...root, metadata: normalizedMetadata }, removedChildIds, changed: true };
}

function migrateProject(project: CanvasProject): { project: CanvasProject; migrated: boolean } {
    if (!Array.isArray(project.nodes)) throw new Error("Canvas data migration failed: project.nodes is not an array");
    if (!Array.isArray(project.connections)) throw new Error("Canvas data migration failed: project.connections is not an array");
    validateProjectShape(project as unknown as UnknownRecord);

    const nodes = project.nodes;
    nodes.forEach((node, index) => {
        if (!isRecord(node) || typeof node.id !== "string") throw new Error(`Canvas data migration failed: project node ${index} is invalid`);
        if (node.metadata !== undefined && !isRecord(node.metadata)) throw new Error(`Canvas data migration failed: project node ${index}.metadata is invalid`);
    });
    project.connections.forEach((connection, index) => {
        if (!isRecord(connection) || typeof connection.id !== "string" || typeof connection.fromNodeId !== "string" || typeof connection.toNodeId !== "string") {
            throw new Error(`Canvas data migration failed: project connection ${index} is invalid`);
        }
    });

    const childrenById = new Map(nodes.filter((node) => legacyMetadata(node)?.batchRootId).map((node) => [node.id, node]));
    const removedChildIds = new Set<string>();
    const migratedRootIds = new Set<string>();
    const childRootById = new Map<string, string>();
    let migrated = false;
    const migratedNodes = nodes.map((node) => {
        const result = migrateLegacyBatch(node, childrenById);
        result.removedChildIds.forEach((id) => removedChildIds.add(id));
        if (result.changed) migratedRootIds.add(node.id);
        if (result.changed) {
            const childIds = legacyMetadata(node)?.batchChildIds || [];
            childIds.forEach((id) => {
                const previousRoot = childRootById.get(id);
                if (previousRoot && previousRoot !== node.id) throw new Error(`Canvas data migration failed: legacy child ${id} belongs to multiple batch roots`);
                childRootById.set(id, node.id);
            });
        }
        migrated ||= result.changed;
        return result.node;
    });

    // Batch children were presentation nodes in v0.12.  They are represented
    // by root.metadata.images in v0.18, so remove only children that have a
    // matching root; orphan nodes are retained as standalone images.
    const finalNodes = migratedNodes
        .filter((node) => !removedChildIds.has(node.id))
        .map((node) => {
            const batchRootId = legacyMetadata(node)?.batchRootId;
            if (!batchRootId || !migratedRootIds.has(batchRootId) || !node.metadata) return node;
            const metadata = withoutLegacyBatchFields(node.metadata);
            migrated = true;
            return { ...node, metadata };
        });

    const finalNodeIds = new Set(finalNodes.map((node) => node.id));
    project.connections.forEach((connection) => {
        const childId = removedChildIds.has(connection.fromNodeId) ? connection.fromNodeId : removedChildIds.has(connection.toNodeId) ? connection.toNodeId : null;
        if (!childId) return;
        const rootId = childRootById.get(childId);
        const isBatchEdge = rootId && ((connection.fromNodeId === rootId && connection.toNodeId === childId) || (connection.fromNodeId === childId && connection.toNodeId === rootId));
        if (!isBatchEdge) throw new Error(`Canvas data migration failed: legacy batch child ${childId} has an external connection`);
    });
    const connections = Array.isArray(project.connections)
        ? project.connections.filter((connection) => finalNodeIds.has(connection.fromNodeId) && finalNodeIds.has(connection.toNodeId) && !removedChildIds.has(connection.fromNodeId) && !removedChildIds.has(connection.toNodeId))
        : [];
    if (connections.length !== project.connections?.length) migrated = true;

    return { project: migrated ? { ...project, nodes: finalNodes, connections } : project, migrated };
}

/** Normalize a persisted Zustand payload without ever replacing malformed data. */
export function migrateCanvasPersistedState(value: unknown): CanvasMigrationResult {
    if (!isRecord(value) || !Array.isArray(value.projects)) throw new Error("Canvas data migration failed: persisted state.projects is missing or invalid");

    let migrated = false;
    const projects = value.projects.map((project, index) => {
        if (!isRecord(project)) throw new Error(`Canvas data migration failed: project ${index} is invalid`);
        const result = migrateProject(project as CanvasProject);
        migrated ||= result.migrated;
        return result.project;
    });
    let deletedProjects: CanvasDeletedProject[];
    if (value.deletedProjects === undefined) {
        deletedProjects = [];
        migrated = true;
    } else if (!Array.isArray(value.deletedProjects)) {
        throw new Error("Canvas data migration failed: persisted state.deletedProjects is not an array");
    } else {
        value.deletedProjects.forEach((deletedProject, index) => {
            if (!isRecord(deletedProject) || !isNonEmptyString(deletedProject.id) || !isNonEmptyString(deletedProject.deletedAt)) {
                throw new Error(`Canvas data migration failed: deleted project ${index} is invalid`);
            }
        });
        deletedProjects = value.deletedProjects as CanvasDeletedProject[];
    }
    return { state: { projects, deletedProjects }, migrated };
}
