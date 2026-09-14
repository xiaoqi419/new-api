import axios from "axios";

import { canvasText, canvasTextWithParams } from "@/lib/canvas-i18n";
import { buildApiUrl, resolveRelayBaseUrl, type AiConfig, type ModelCapability, type ModelChannel } from "@/stores/use-config-store";

/** Model metadata used by the embedded host bootstrap and channel editor. */
export type AvailableModel = {
    name: string;
    capability: ModelCapability;
    supportsImage: boolean;
    capabilitySource: "metadata" | "heuristic";
};

type CatalogConfig = Pick<AiConfig, "baseUrl" | "apiKey" | "apiFormat">;
type RawModel = Record<string, unknown>;

function normalizeModelName(value: unknown) {
    return typeof value === "string" ? value.trim().replace(/^models\//i, "") : "";
}

function evidenceValues(record: RawModel, keys: string[]) {
    return keys.flatMap((key) => {
        const value = record[key];
        if (typeof value === "string") return [value];
        if (Array.isArray(value)) return value.filter((item): item is string => typeof item === "string");
        return [];
    });
}

function normalized(value: string) {
    return value.toLowerCase().replace(/[^a-z0-9]+/g, "");
}

function hasAny(values: string[], terms: string[]) {
    return values.some((value) => terms.some((term) => normalized(value).includes(term)));
}

function inferCapability(name: string, records: readonly RawModel[]): AvailableModel {
    const output = records.flatMap((record) => evidenceValues(record, ["output", "output_modalities", "modalities", "capabilities", "supportedGenerationMethods", "supported_generation_methods"]));
    const endpoint = records.flatMap((record) => evidenceValues(record, ["endpoint", "path", "type", "task", "operation"]));
    const input = records.flatMap((record) => evidenceValues(record, ["input", "input_modalities", "inputTypes", "supportedInput"]));
    const all = [...output, ...endpoint];

    // Explicit output metadata wins over broad endpoint/capability hints.
    if (hasAny(output, ["image", "imagegeneration", "texttoimage", "imagegen", "dalle", "imagen", "seedream"])) {
        return { name, capability: "image", supportsImage: true, capabilitySource: "metadata" };
    }
    if (hasAny(output, ["video", "videogeneration", "texttovideo"])) return { name, capability: "video", supportsImage: false, capabilitySource: "metadata" };
    if (hasAny(output, ["audio", "speech", "tts", "music"])) return { name, capability: "audio", supportsImage: false, capabilitySource: "metadata" };
    if (hasAny(output, ["text", "chat", "completion", "response"])) return { name, capability: "text", supportsImage: false, capabilitySource: "metadata" };

    const lowerName = normalized(name);
    let capability: ModelCapability = "text";
    if (hasAny(all, ["video", "videogeneration", "texttovideo"]) || ["video", "sora", "veo", "kling", "wan", "hailuo"].some((term) => lowerName.includes(term))) capability = "video";
    else if (hasAny(all, ["audio", "speech", "tts", "music"]) || ["audio", "tts", "speech", "voice", "music", "sound"].some((term) => lowerName.includes(term))) capability = "audio";
    else if (
        hasAny(all, ["image", "imagegeneration", "texttoimage", "imagegen", "dalle", "imagen", "seedream", "flux", "sdxl"]) ||
        ["seedream", "gptimage", "dalle", "imagen", "flux", "sdxl", "stablediffusion", "midjourney", "imagegen"].some((term) => lowerName.includes(term))
    ) {
        // A vision/input-only model should remain text-capable unless the name
        // or metadata also indicates image output.
        const inputOnly = hasAny(input, ["image", "vision", "inputimage"]) && !hasAny(all, ["imagegeneration", "texttoimage", "imagegen"]);
        capability = inputOnly ? "text" : "image";
    }
    return { name, capability, supportsImage: capability === "image", capabilitySource: "heuristic" };
}

function groupModels(models: readonly (RawModel | string)[]) {
    const groups = new Map<string, RawModel[]>();
    for (const item of models) {
        const name = typeof item === "string" ? normalizeModelName(item) : normalizeModelName(item.id) || normalizeModelName(item.name);
        if (!name) continue;
        const records = groups.get(name) || [];
        records.push(typeof item === "string" ? {} : item);
        groups.set(name, records);
    }
    return Array.from(groups, ([name, records]) => inferCapability(name, records)).sort((a, b) => a.name.localeCompare(b.name));
}

function readError(value: unknown): string {
    if (typeof value === "string") return value;
    if (!value || typeof value !== "object") return "";
    const record = value as Record<string, unknown>;
    const error = record.error;
    if (typeof error === "string") return error;
    if (error && typeof error === "object" && typeof (error as Record<string, unknown>).message === "string") return (error as Record<string, unknown>).message as string;
    return typeof record.message === "string" ? record.message : typeof record.msg === "string" ? record.msg : "";
}

function safeError(value: unknown, fallback: string) {
    const raw = readError(value).trim();
    if (!raw || /<(?:!doctype|html|head|body|script|style)\b/i.test(raw)) return fallback;
    return raw
        .replace(/(?:https?|wss?|ftp):\/\/[^\s<>"'`]+/gi, "[redacted]")
        .replace(/Bearer\s+[^\s,;)}\]]+/gi, "Bearer [redacted]")
        .replace(/([?&](?:api[_-]?key|key|token|access[_-]?token|secret|password)=)[^&#\s"'<>]+/gi, "$1[redacted]")
        .replace(/\b(?:sk|rk|pk)[-_][A-Za-z0-9][A-Za-z0-9._~-]*\b/gi, "[redacted]")
        .slice(0, 300);
}

function geminiBaseUrl(config: CatalogConfig) {
    const base = resolveRelayBaseUrl(config.baseUrl).trim().replace(/\/+$/, "");
    const lower = base.toLowerCase();
    return lower.endsWith("/v1") || lower.endsWith("/v1beta") ? base : `${base}/v1beta`;
}

/** Fetch model metadata from the selected channel, preserving capability evidence. */
export async function fetchModelCatalog(config: CatalogConfig): Promise<AvailableModel[]> {
    try {
        if (config.apiFormat === "gemini") {
            const base = geminiBaseUrl(config);
            const response = await axios.get<{ models?: RawModel[]; error?: unknown }>(`${base}/models`, {
                headers: { "x-goog-api-key": config.apiKey },
            });
            if (response.data?.error) throw new Error(safeError(response.data.error, canvasText("media.modelList")));
            return groupModels(Array.isArray(response.data?.models) ? response.data.models : []);
        }
        const response = await axios.get<{ data?: RawModel[]; error?: unknown; message?: unknown }>(buildApiUrl(config.baseUrl, "/models"), {
            headers: { Authorization: `Bearer ${config.apiKey}` },
        });
        if (response.data?.error || response.data?.message) throw new Error(safeError(response.data.error || response.data.message, canvasText("media.modelList")));
        return groupModels(Array.isArray(response.data?.data) ? response.data.data : []);
    } catch (error) {
        if (axios.isAxiosError(error)) {
            const status = error.response?.status;
            if (status === 401 || status === 403) throw new Error(canvasText("media.authError"));
            if (status === 429) throw new Error(canvasText("media.rateLimit"));
            if (status && status >= 500) throw new Error(canvasTextWithParams("media.serverError", { status }));
            if (!error.response) throw new Error(canvasText("media.networkError"));
        }
        throw new Error(safeError(error, canvasText("media.modelList")));
    }
}

export async function fetchImageModels(config: CatalogConfig) {
    return (await fetchModelCatalog(config)).map((model) => model.name);
}

export async function fetchChannelModels(channel: ModelChannel) {
    return fetchImageModels({ baseUrl: channel.baseUrl, apiKey: channel.apiKey, apiFormat: channel.apiFormat });
}
