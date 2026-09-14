import { saveAs } from "file-saver";

import { isEmbedded, lockedApiBaseUrl } from "@/lib/host-bridge";
import {
    createModelChannel,
    defaultConfig,
    defaultWebdavSyncConfig,
    modelOptionName,
    normalizeModelOptionValue,
    modelOptionsFromChannels,
    normalizeChannelModels,
    useConfigStore,
    type AiConfig,
    type ApiCallFormat,
    type ChannelModel,
    type ModelChannel,
    type WebdavSyncConfig,
} from "@/stores/use-config-store";
import { usePromptSourceStore, type PromptSourceSchedule } from "@/stores/use-prompt-source-store";
import { createPromptSource, DEFAULT_PROMPT_SOURCES, type PromptSource } from "@/services/api/prompt-source-presets";

/** Stable user-facing key used by the config panel when an import is rejected. */
export const CONFIG_FILE_INVALID_MESSAGE = "配置文件格式不正确";

const MAX_CONFIG_FILE_BYTES = 10 * 1024 * 1024;
const MAX_IMPORT_LIST_ITEMS = 256;
const MAX_IMPORT_STRING_LENGTH = 100_000;
const MAX_URL_LENGTH = 2_048;
const MAX_API_KEY_LENGTH = 512;

type AppConfigFile = {
    app: "infinite-canvas";
    version: 1;
    exportedAt: string;
    config: AiConfig;
    webdav: WebdavSyncConfig;
    promptSources: {
        sources: PromptSource[];
        schedule: PromptSourceSchedule;
    };
};

export function exportAppConfig() {
    const { config, webdav } = useConfigStore.getState();
    const { sources, schedule } = usePromptSourceStore.getState();
    // The embedded build receives a usable key from the authenticated host at
    // runtime. Normalize before writing a file so a downloaded config cannot
    // become a second copy of that credential (or retain a stale external URL).
    const data: AppConfigFile = {
        app: "infinite-canvas",
        version: 1,
        exportedAt: new Date().toISOString(),
        config: normalizeImportedConfig(config),
        webdav: normalizeImportedWebdav(webdav),
        promptSources: normalizeImportedPromptSources({ sources, schedule }),
    };
    saveAs(new Blob([JSON.stringify(data, null, 2)], { type: "application/json;charset=utf-8" }), "infinite-canvas-config.json");
}

export async function importAppConfig(file: File) {
    const data = await readAppConfigFile(file);
    const locked = lockedApiBaseUrl();
    // A model script runs with the active channel key in scope. Imported files
    // are untrusted input, so embedded imports keep the model metadata but do
    // not activate arbitrary script code that could exfiltrate the host key.
    const config = normalizeImportedConfig(data.config, locked, { stripScripts: Boolean(locked) });
    const webdav = normalizeImportedWebdav(data.webdav);
    const promptSources = normalizeImportedPromptSources(data.promptSources);

    // All three payloads are normalized before either store is touched. A
    // malformed file therefore leaves the previous working configuration
    // intact instead of partially replacing it with unsafe values.
    useConfigStore.setState({ config, webdav });
    usePromptSourceStore.setState(promptSources);
}

async function readAppConfigFile(file: File): Promise<{ config: Record<string, unknown>; webdav: Record<string, unknown>; promptSources: Record<string, unknown> }> {
    if (!file || typeof file.text !== "function" || (typeof file.size === "number" && file.size > MAX_CONFIG_FILE_BYTES)) throw invalidConfigError();

    let parsed: unknown;
    try {
        const text = await file.text();
        if (typeof text !== "string" || text.length > MAX_CONFIG_FILE_BYTES) throw invalidConfigError();
        parsed = JSON.parse(text) as unknown;
    } catch {
        throw invalidConfigError();
    }

    if (!isRecord(parsed) || parsed.app !== "infinite-canvas" || parsed.version !== 1 || !isRecord(parsed.config) || !isRecord(parsed.webdav) || !isRecord(parsed.promptSources)) {
        throw invalidConfigError();
    }
    return {
        config: parsed.config,
        webdav: parsed.webdav,
        promptSources: parsed.promptSources,
    };
}

function invalidConfigError() {
    return new Error(CONFIG_FILE_INVALID_MESSAGE);
}

function isRecord(value: unknown): value is Record<string, unknown> {
    return Boolean(value) && typeof value === "object" && !Array.isArray(value);
}

function stripControlChars(value: string) {
    return [...value]
        .filter((character) => {
            const code = character.charCodeAt(0);
            return code >= 0x20 && code !== 0x7f;
        })
        .join("");
}

function boundedString(value: unknown, fallback = "", maxLength = MAX_IMPORT_STRING_LENGTH) {
    if (typeof value !== "string") return fallback;
    return value.slice(0, maxLength);
}

function readApiFormat(value: unknown): ApiCallFormat {
    return value === "gemini" ? value : "openai";
}

function readReasoningEffort(value: unknown): AiConfig["reasoningEffort"] {
    return value === "low" || value === "medium" || value === "high" || value === "xhigh" ? value : "auto";
}

function readBaseUrl(value: unknown, fallback: string) {
    const candidate = boundedString(value, "", MAX_URL_LENGTH).trim();
    if (!candidate) return fallback;
    // Keep support for relative/local development endpoints, but never import
    // a scriptable or otherwise non-HTTP protocol into a fetch configuration.
    try {
        const parsed = new URL(candidate, "http://canvas.invalid");
        if (!["http:", "https:"].includes(parsed.protocol)) return fallback;
    } catch {
        return fallback;
    }
    return candidate;
}

function readApiKey(value: unknown) {
    return boundedString(value, "", MAX_API_KEY_LENGTH);
}

function readModelList(value: unknown) {
    if (!Array.isArray(value)) return [];
    return value
        .slice(0, MAX_IMPORT_LIST_ITEMS)
        .map((item) => boundedString(item, "", 512).trim())
        .filter(Boolean);
}

function readModelValues(value: unknown) {
    return readModelList(value).map(modelOptionName);
}

function readFallbackModels(source: Record<string, unknown>) {
    return normalizeChannelModels(
        [
            boundedString(source.model, "", 512),
            boundedString(source.imageModel, "", 512),
            boundedString(source.videoModel, "", 512),
            boundedString(source.textModel, "", 512),
            boundedString(source.audioModel, "", 512),
            ...readModelValues(source.models),
        ].filter(Boolean),
    );
}

function readModelRecords(value: unknown) {
    if (!Array.isArray(value)) return [] as Array<string | ChannelModel>;
    return value
        .slice(0, MAX_IMPORT_LIST_ITEMS)
        .map((item) => {
            if (typeof item === "string") return boundedString(item, "", 512);
            if (!isRecord(item)) return null;
            return {
                name: boundedString(item.name, "", 512),
                capability: item.capability,
                script: boundedString(item.script, "", MAX_IMPORT_STRING_LENGTH),
            } as unknown as ChannelModel;
        })
        .filter((item): item is string | ChannelModel => typeof item === "string" || (isRecord(item) && typeof item.name === "string"));
}

function uniqueChannelId(value: unknown, index: number, used: Set<string>) {
    const original = boundedString(value, "", 160).trim() || (index === 0 ? "default" : `channel-${index + 1}`);
    let candidate = original;
    let suffix = 2;
    while (used.has(candidate)) candidate = `${original}-${suffix++}`;
    used.add(candidate);
    return candidate;
}

/**
 * Normalize an imported/exported AI config without calling the store's private
 * hydration path. This is intentionally exported so the hostile-input cases
 * can be tested without touching browser file APIs.
 */
export function normalizeImportedConfig(value: unknown, lockedBaseUrl = lockedApiBaseUrl(), options: { stripScripts?: boolean } = {}): AiConfig {
    const source = isRecord(value) ? value : {};
    const embedded = isEmbedded();
    // The optional lock is kept for standalone callers and tests, but it must
    // never be able to override the authenticated host origin in an iframe.
    // Re-read the lock from the current window so a stale or forged argument
    // cannot redirect imported channels to an external provider.
    const effectiveLockedBaseUrl = embedded ? lockedApiBaseUrl() : lockedBaseUrl;
    const stripScripts = embedded || Boolean(effectiveLockedBaseUrl && options.stripScripts);
    const apiFormat = readApiFormat(source.apiFormat);
    const globalBaseUrl = embedded ? effectiveLockedBaseUrl : effectiveLockedBaseUrl || readBaseUrl(source.baseUrl, defaultConfig.baseUrl);
    const globalApiKey = embedded || effectiveLockedBaseUrl ? "" : readApiKey(source.apiKey);
    const rawChannels = Array.isArray(source.channels) ? source.channels : [];
    const usedIds = new Set<string>();
    const channels: ModelChannel[] = [];

    rawChannels.slice(0, MAX_IMPORT_LIST_ITEMS).forEach((rawChannel, index) => {
        if (!isRecord(rawChannel)) return;
        const id = uniqueChannelId(rawChannel.id, index, usedIds);
        const channelApiFormat = readApiFormat(rawChannel.apiFormat);
        const channelBaseUrl = embedded ? effectiveLockedBaseUrl : effectiveLockedBaseUrl || readBaseUrl(rawChannel.baseUrl, globalBaseUrl || defaultConfig.baseUrl);
        const channelApiKey = embedded || effectiveLockedBaseUrl ? "" : readApiKey(rawChannel.apiKey);
        const models = normalizeChannelModels(readModelRecords(rawChannel.models));
        const safeModels = stripScripts ? models.map(({ name, capability }) => ({ name, capability })) : models;
        const channel = createModelChannel({
            id,
            name: boundedString(rawChannel.name, "", 160).trim() || (index === 0 ? "默认渠道" : `渠道 ${index + 1}`),
            baseUrl: channelBaseUrl,
            apiKey: channelApiKey,
            apiFormat: channelApiFormat,
            models: safeModels,
        });
        channels.push({ ...channel, id, baseUrl: channelBaseUrl, apiKey: channelApiKey, models: safeModels });
    });

    if (!channels.length) {
        const fallbackModels = readFallbackModels(source);
        const fallbackChannel = createModelChannel({
            id: "default",
            name: "默认渠道",
            baseUrl: globalBaseUrl,
            apiKey: globalApiKey,
            apiFormat,
            models: fallbackModels,
        });
        channels.push({ ...fallbackChannel, id: "default", baseUrl: globalBaseUrl, apiKey: globalApiKey, models: fallbackModels });
    } else if (channels.every((channel) => !channel.models.length)) {
        // Older exports may keep model names only in the top-level fields. Use
        // those names when every imported channel is otherwise empty, while
        // preserving explicitly configured channel lists as-is.
        const fallbackModels = readFallbackModels(source);
        if (fallbackModels.length) channels[0] = { ...channels[0], models: fallbackModels };
    }

    const modelOptions = modelOptionsFromChannels(channels);
    const readConfigString = (key: keyof AiConfig) => boundedString(source[key], defaultConfig[key] as string, MAX_IMPORT_STRING_LENGTH);
    const readModelSelection = (key: keyof AiConfig) => {
        const candidate = boundedString(source[key], "", 512).trim();
        if (!candidate) return "";
        const normalized = normalizeModelOptionValue(candidate, channels);
        return modelOptions.includes(normalized) ? normalized : "";
    };
    const config = {
        // Preserve forward-compatible fields from newer Canvas releases while
        // replacing every field consumed by this version with a normalized
        // value below. JSON.parse only yields data objects, so this spread does
        // not execute imported code.
        ...source,
        ...defaultConfig,
        channelMode: "local",
        baseUrl: globalBaseUrl,
        apiKey: globalApiKey || channels[0]?.apiKey || "",
        apiFormat,
        channels,
        model: readModelSelection("model"),
        imageModel: readModelSelection("imageModel"),
        videoModel: readModelSelection("videoModel"),
        textModel: readModelSelection("textModel"),
        audioModel: readModelSelection("audioModel"),
        audioVoice: readConfigString("audioVoice"),
        audioFormat: readConfigString("audioFormat"),
        audioSpeed: readConfigString("audioSpeed"),
        audioInstructions: readConfigString("audioInstructions"),
        videoSeconds: readConfigString("videoSeconds"),
        vquality: readConfigString("vquality"),
        videoGenerateAudio: readConfigString("videoGenerateAudio"),
        videoWatermark: readConfigString("videoWatermark"),
        videoMode: source.videoMode === "reference" ? "reference" : "frames",
        systemPrompt: readConfigString("systemPrompt"),
        reasoningEffort: readReasoningEffort(source.reasoningEffort),
        models: modelOptions,
        quality: readConfigString("quality"),
        size: readConfigString("size"),
        background: readConfigString("background"),
        count: readConfigString("count"),
        canvasImageCount: readConfigString("canvasImageCount"),
        proxyEnabled: source.proxyEnabled === true,
        proxyUrl: readConfigString("proxyUrl"),
    } as AiConfig;

    // A locked host URL/key is an invariant, including for values nested in a
    // channel. Keep the explicit assignments here even though the channel
    // constructor also applies the lock, so future constructor changes cannot
    // accidentally reopen imported credentials.
    if (embedded || effectiveLockedBaseUrl) {
        config.baseUrl = effectiveLockedBaseUrl;
        config.apiKey = "";
        config.channels = config.channels.map((channel) => ({ ...channel, baseUrl: effectiveLockedBaseUrl, apiKey: "" }));
    }
    return config;
}

export function normalizeImportedWebdav(value: unknown): WebdavSyncConfig {
    const source = isRecord(value) ? value : {};
    const rawDirectory = stripControlChars(boundedString(source.directory, defaultWebdavSyncConfig.directory, 512)).trim();
    return {
        ...defaultWebdavSyncConfig,
        url: readHttpUrl(source.url),
        username: stripControlChars(boundedString(source.username, "", 512)),
        password: stripControlChars(boundedString(source.password, "", 512)),
        // An explicitly empty directory is a valid WebDAV root target; only
        // a missing/non-string value receives the historical default.
        directory: rawDirectory || (typeof source.directory === "string" ? "" : defaultWebdavSyncConfig.directory),
        lastSyncedAt: stripControlChars(boundedString(source.lastSyncedAt, "", 128)),
    };
}

function readHttpUrl(value: unknown, optional = false) {
    const candidate = boundedString(value, "", MAX_URL_LENGTH).trim();
    if (!candidate && optional) return "";
    if (!candidate) return "";
    try {
        const parsed = new URL(candidate);
        if (!["http:", "https:"].includes(parsed.protocol) || parsed.username || parsed.password) return "";
    } catch {
        return "";
    }
    return candidate;
}

export function normalizeImportedPromptSources(value: unknown): { sources: PromptSource[]; schedule: PromptSourceSchedule } {
    const source = isRecord(value) ? value : {};
    const savedSources = Array.isArray(source.sources) ? source.sources.slice(0, MAX_IMPORT_LIST_ITEMS) : [];
    const enabledById = new Map<string, boolean>();
    const custom: PromptSource[] = [];
    const builtInIds = new Set(DEFAULT_PROMPT_SOURCES.map((item) => item.id));
    const customIds = new Set<string>();

    for (const item of savedSources) {
        if (!isRecord(item)) continue;
        const id = boundedString(item.id, "", 160).trim();
        if (!id) continue;
        const enabled = typeof item.enabled === "boolean" ? item.enabled : true;
        if (builtInIds.has(id)) {
            enabledById.set(id, enabled);
            continue;
        }
        if (customIds.has(id)) continue;
        const name = boundedString(item.name, "", 512).trim();
        const url = readHttpUrl(item.url);
        if (!name || !url) continue;
        customIds.add(id);
        custom.push(
            createPromptSource({
                id,
                name,
                url,
                homepage: readHttpUrl(item.homepage, true),
                enabled,
                builtIn: false,
            }),
        );
    }

    const sources = [...DEFAULT_PROMPT_SOURCES.map((item) => ({ ...item, enabled: enabledById.get(item.id) ?? item.enabled })), ...custom];
    const rawSchedule = isRecord(source.schedule) ? source.schedule : {};
    const interval = Number(rawSchedule.intervalMinutes);
    const allowedIntervals = new Set([0, 30, 60, 360, 1440]);
    const schedule: PromptSourceSchedule = {
        intervalMinutes: Number.isInteger(interval) && allowedIntervals.has(interval) ? interval : 30,
        lastFetchedAt: boundedString(rawSchedule.lastFetchedAt, "", 128),
    };
    return { sources, schedule };
}
