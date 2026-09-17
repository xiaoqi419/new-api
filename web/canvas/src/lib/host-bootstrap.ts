import { create } from "zustand";

import { fetchModelCatalog, type AvailableModel } from "@/services/api/model-catalog";
import {
    createModelChannel,
    encodeChannelModel,
    modelCapabilityOf,
    modelOptionName,
    modelOptionsFromChannels,
    normalizeModelOptionValue,
    selectableModelsByCapability,
    useConfigStore,
    type AiConfig,
    type ChannelModel,
    type ModelChannel,
} from "@/stores/use-config-store";
import { hasTrustedEmbeddedOrigin, isEmbedded, lockedApiBaseUrl, requestHostTokens, retryHostTokens, useHostTokensStore, type HostToken } from "@/lib/host-bridge";
import { normalizeRelayKey, sanitizeHostError } from "@/lib/host-contract";
import { canvasText } from "@/lib/canvas-i18n";

export type HostBootstrapStatus = "idle" | "loading" | "ready" | "error";
export type HostModelStatus = "idle" | "loading" | "ready" | "error";

export type HostBootstrapState = {
    status: HostBootstrapStatus;
    error: string;
    modelStatus: HostModelStatus;
    modelError: string;
    availableImageModels: AvailableModel[];
    userId: number;
};

export const useHostBootstrapStore = create<HostBootstrapState>()(() => ({
    status: "idle",
    error: "",
    modelStatus: "idle",
    modelError: "",
    availableImageModels: [],
    userId: 0,
}));

let started = false;
let generation = 0;
let lastTokenSignature = "";
let stopSubscription: (() => void) | null = null;
let tokenRequestRecoveryTimer: ReturnType<typeof setTimeout> | null = null;

// The parent listener is installed by a React effect, while the iframe can
// start executing from cache before that effect has run. A token request sent
// in that small window is therefore allowed to disappear. Keep the retry
// bounded: this recovers a lost handshake without turning a parent outage into
// an unbounded stream of key-list requests (the host endpoint is rate limited).
const TOKEN_REQUEST_RECOVERY_DELAY_MS = 1500;
const TOKEN_REQUEST_RECOVERY_ATTEMPTS = 2;

const emptyHostBootstrapState: HostBootstrapState = {
    status: "idle",
    error: "",
    modelStatus: "idle",
    modelError: "",
    availableImageModels: [],
    userId: 0,
};

function clearTokenRequestRecoveryTimer() {
    if (tokenRequestRecoveryTimer !== null) {
        clearTimeout(tokenRequestRecoveryTimer);
        tokenRequestRecoveryTimer = null;
    }
}

function markTokenRequestTimeout(requestId: string) {
    if (!started) return;
    const state = useHostTokensStore.getState();
    if (state.status !== "loading" || state.requestId !== requestId) return;
    useHostTokensStore.setState({
        status: "error",
        tokens: [],
        error: canvasText("host.tokenRequestTimeout"),
        userId: state.userId,
        requestId,
    });
}

function markTokenRequestUnavailable(requestId: string) {
    if (!started) return;
    const state = useHostTokensStore.getState();
    if (state.status !== "loading" || state.requestId !== requestId) return;
    useHostTokensStore.setState({
        status: "error",
        tokens: [],
        error: canvasText("host.tokenRequestUnavailable"),
        userId: state.userId,
        requestId,
    });
}

function scheduleTokenRequestRecovery(requestId: string, attempt = 0) {
    clearTokenRequestRecoveryTimer();
    if (!started) return;
    if (!requestId) {
        markTokenRequestUnavailable(requestId);
        return;
    }
    if (attempt > TOKEN_REQUEST_RECOVERY_ATTEMPTS) return;
    const state = useHostTokensStore.getState();
    if (state.status !== "loading" || state.requestId !== requestId) return;

    tokenRequestRecoveryTimer = setTimeout(() => {
        tokenRequestRecoveryTimer = null;
        if (!started) return;
        const current = useHostTokensStore.getState();
        if (current.status !== "loading" || current.requestId !== requestId) return;

        if (attempt === TOKEN_REQUEST_RECOVERY_ATTEMPTS) {
            markTokenRequestTimeout(requestId);
            return;
        }

        const nextRequestId = requestHostTokens({ force: true });
        if (!nextRequestId) {
            markTokenRequestUnavailable(requestId);
            return;
        }
        scheduleTokenRequestRecovery(nextRequestId, attempt + 1);
    }, TOKEN_REQUEST_RECOVERY_DELAY_MS);
}

function replaceConfig(config: AiConfig) {
    useConfigStore.setState({ config });
}

function canonicalTokens(tokens: HostToken[]) {
    const seen = new Set<string>();
    const source = Array.isArray(tokens) ? tokens : [];
    return source
        .filter((token): token is HostToken => Boolean(token) && typeof token === "object")
        .map((token) => ({ ...token, key: normalizeRelayKey(token.key) }))
        .filter((token) => token.key && !seen.has(token.key) && seen.add(token.key));
}

function tokenSignature(tokens: HostToken[], userId: number) {
    return `${userId}:${canonicalTokens(tokens)
        .map((token) => `${token.id}:${token.key}`)
        .join("|")}`;
}

function clearLegacySessionMarker() {
    if (typeof localStorage !== "undefined") localStorage.removeItem("infinite-canvas:host-user-id");
}

function keepEmbeddedChannelModels(channel: ModelChannel, currentKey: string): ChannelModel[] {
    return (Array.isArray(channel.models) ? channel.models : []).filter((entry) => {
        if (!entry || typeof entry !== "object") return false;
        if (entry.capability !== "image") return true;
        if (entry.verified !== true) return false;
        const key = currentKey || channel.apiKey || "";
        const bound = typeof entry.verifiedKey === "string" ? entry.verifiedKey : "";
        if (key && bound && bound !== key) return false;
        return true;
    });
}

function stampVerifiedKeys(config: AiConfig): AiConfig {
    const channels = (Array.isArray(config.channels) ? config.channels : []).map((channel) => ({
        ...channel,
        models: (Array.isArray(channel.models) ? channel.models : []).map((model) => (model.verified ? { ...model, verifiedKey: channel.apiKey } : model)),
    }));
    return { ...config, channels };
}

/** Remove unverified image models from an embedded config, keeping user-saved verified ones. */
export function clearUnavailableImageConfig(config: AiConfig): AiConfig {
    const embedded = isEmbedded();
    if (!embedded || !config || typeof config !== "object") return config;
    const baseUrl = lockedApiBaseUrl();
    const hasTrustedOrigin = Boolean(baseUrl);
    const model = typeof config.model === "string" ? config.model : "";
    const imageModel = typeof config.imageModel === "string" ? config.imageModel : "";
    const channels = (Array.isArray(config.channels) ? config.channels : [])
        .filter((channel) => channel && typeof channel === "object")
        .map((channel) => {
            const apiKey = hasTrustedOrigin ? channel.apiKey : "";
            const models = keepEmbeddedChannelModels(channel, apiKey).map((model) => (model.verified && apiKey ? { ...model, verifiedKey: apiKey } : model));
            return {
                ...channel,
                baseUrl,
                apiKey,
                models,
            };
        });
    const nextModels = modelOptionsFromChannels(channels);
    const imageModelStillPresent = Boolean(imageModel && nextModels.includes(imageModel));
    const shouldClearCurrentModel = Boolean(model && (model === imageModel || modelCapabilityOf(config, model) === "image") && !nextModels.includes(model));
    return {
        ...config,
        baseUrl,
        apiKey: hasTrustedOrigin ? config.apiKey : "",
        channels,
        models: nextModels,
        imageModel: imageModelStillPresent ? imageModel : "",
        ...(shouldClearCurrentModel ? { model: "" } : {}),
    };
}

/**
 * Keep only keys that the current host response explicitly authorizes.
 * Saved token identities must match both the current account and its authorized
 * token list. Legacy in-memory keys are accepted only when explicitly listed.
 */
export function reconcileHostConfig(config: AiConfig, tokens: HostToken[], userId = useHostTokensStore.getState().userId): { config: AiConfig; selectedKey: string } {
    const safeConfig = config && typeof config === "object" ? config : ({} as AiConfig);
    const embedded = isEmbedded();
    const lockedBaseUrl = embedded ? lockedApiBaseUrl() : "";
    // A sandboxed/opaque embedded document cannot authenticate the parent.
    // Drop even an otherwise valid token response in that state so no stored
    // key can later be paired with a fallback provider URL.
    const normalizedTokens = embedded && !lockedBaseUrl ? [] : canonicalTokens(tokens);
    const allowedKeys = new Set(normalizedTokens.map((token) => token.key));
    const normalizeAllowed = (value: unknown) => {
        const key = normalizeRelayKey(value);
        return allowedKeys.has(key) ? key : "";
    };

    let channels: ModelChannel[] = (Array.isArray(safeConfig.channels) ? safeConfig.channels : [])
        .filter((channel): channel is ModelChannel => Boolean(channel) && typeof channel === "object")
        .map((channel, index) => {
            const hasSelection = channel.hostTokenId !== undefined || channel.hostUserId !== undefined;
            const selectedToken = hasSelection ? normalizedTokens.find((token) => channel.hostUserId === userId && token.id === channel.hostTokenId) : normalizedTokens.find((token) => token.key === normalizeAllowed(channel.apiKey));
            const apiKey = selectedToken?.key || "";
            // Keep preferences during a pending handshake, but never transfer
            // verification evidence to a different account or revoked token.
            const rejectedSelection = hasSelection && (tokens.length > 0 || useHostTokensStore.getState().status === "ready") && !selectedToken;
            return createModelChannel({
                ...channel,
                id: (typeof channel.id === "string" && channel.id.trim() && channel.id) || (index === 0 ? "default" : `channel-${index + 1}`),
                name: (typeof channel.name === "string" && channel.name.trim() && channel.name) || (index === 0 ? "默认渠道" : `渠道 ${index + 1}`),
                baseUrl: embedded ? lockedBaseUrl : (typeof channel.baseUrl === "string" && channel.baseUrl) || "",
                apiKey,
                ...(selectedToken && userId > 0 ? { hostTokenId: selectedToken.id, hostUserId: userId } : {}),
                models: (Array.isArray(channel.models) ? channel.models : []).map((model) => ({ ...model, ...(rejectedSelection ? { verified: false } : {}), verifiedKey: apiKey && model.verified && !rejectedSelection ? apiKey : "" })),
            });
        });
    const globalKey = channels.some((channel) => channel.hostTokenId !== undefined || channel.hostUserId !== undefined) ? "" : normalizeAllowed(safeConfig.apiKey);
    if (!channels.length) {
        channels = [
            createModelChannel({
                id: "default",
                name: "默认渠道",
                baseUrl: embedded ? lockedBaseUrl : safeConfig.baseUrl,
                apiKey: "",
                apiFormat: safeConfig.apiFormat,
                models: [],
            }),
        ];
    }

    let selectedKey = channels.find((channel) => channel.apiKey)?.apiKey || globalKey;
    if (!selectedKey && !channels.some((channel) => channel.hostTokenId !== undefined || channel.hostUserId !== undefined)) selectedKey = normalizedTokens[0]?.key || "";
    // The catalog request is made for the channel carrying the selected key.
    // If the key only came from the global field (or the first host token),
    // associate it with the first channel so model and request routing agree.
    if (selectedKey && !channels.some((channel) => channel.apiKey === selectedKey)) {
        const token = normalizedTokens.find((item) => item.key === selectedKey);
        channels = channels.map((channel, index) => (index === 0 ? { ...channel, apiKey: selectedKey, ...(token && userId > 0 ? { hostTokenId: token.id, hostUserId: userId } : {}) } : channel));
    }

    const firstChannelKey = channels[0]?.apiKey || "";
    const reconciledConfig: AiConfig = {
        ...safeConfig,
        baseUrl: embedded ? lockedBaseUrl : safeConfig.baseUrl,
        apiKey: firstChannelKey || selectedKey,
        channels,
    };
    return {
        config: normalizedTokens.length ? reconciledConfig : clearUnavailableImageConfig(reconciledConfig),
        selectedKey: firstChannelKey || selectedKey,
    };
}

function validModelValue(config: AiConfig, value: string, capability: "image" | "video" | "text" | "audio") {
    if (typeof value !== "string") return "";
    const normalized = normalizeModelOptionValue(value, config.channels);
    return selectableModelsByCapability(config, capability).includes(normalized) ? normalized : "";
}

/** Apply a verified provider catalog without carrying stale model ids forward. */
export function applyModelCatalog(config: AiConfig, catalog: AvailableModel[], channelId?: string): AiConfig {
    const channels = (Array.isArray(config.channels) ? config.channels : []).filter((channel) => channel && typeof channel === "object");
    const verifiedCatalog = (Array.isArray(catalog) ? catalog : []).filter(
        (item): item is AvailableModel =>
            Boolean(item) &&
            typeof item.name === "string" &&
            Boolean(item.name.trim()) &&
            (item.capability === "image" || item.capability === "video" || item.capability === "text" || item.capability === "audio") &&
            typeof item.supportsImage === "boolean" &&
            (item.capabilitySource === "metadata" || item.capabilitySource === "heuristic"),
    );
    const targetIndex = channelId ? channels.findIndex((channel) => channel.id === channelId) : channels.findIndex((channel) => channel.apiKey === config.apiKey);
    // A stale channel id or key must never update the first channel by
    // accident.  This is especially important after account/channel changes:
    // the catalog response belongs to the request's channel, not whichever
    // channel happens to be at index 0 now.
    if (targetIndex < 0) return config;
    const target = channels[targetIndex];
    if (!target) return config;
    const existing = new Map((Array.isArray(target.models) ? target.models : []).filter((model) => model && typeof model === "object" && typeof model.name === "string").map((model) => [model.name, model]));
    const models: ChannelModel[] = verifiedCatalog.map((item) => {
        const previous = existing.get(item.name);
        const capability = item.capabilitySource === "heuristic" ? previous?.capability || item.capability : item.capability;
        // Keep an explicit runtime marker so the image request boundary can
        // distinguish a model confirmed by the current user's catalog from a
        // stale/manual entry restored from local state.  Binding the marker to
        // the key also invalidates it when a user changes the channel key. The
        // extra fields are intentionally additive to ChannelModel for backwards
        // compatibility.
        return {
            name: item.name,
            capability,
            script: previous?.script,
            verified: item.supportsImage && capability === "image",
            verifiedKey: target.apiKey || config.apiKey,
        };
    });
    const embedded = isEmbedded();
    const baseUrl = embedded ? lockedApiBaseUrl() : "";
    const nextChannels = channels.map((channel, index) => (index === targetIndex ? { ...channel, baseUrl: embedded ? baseUrl : channel.baseUrl, models } : { ...channel, baseUrl: embedded ? baseUrl : channel.baseUrl }));
    const next: AiConfig = { ...config, channels: nextChannels, models: modelOptionsFromChannels(nextChannels) };
    const imageCandidateNames = new Set(models.filter((model) => model.capability === "image").map((model) => model.name));
    const imageCandidates = verifiedCatalog.filter((item) => item.supportsImage && imageCandidateNames.has(item.name));
    const oldImageName = modelOptionName(config.imageModel || (modelCapabilityOf(config, config.model) === "image" ? config.model : ""));
    const selectedImageName = imageCandidates.some((item) => item.name === oldImageName) ? oldImageName : imageCandidates[0]?.name || "";
    const selectedImage = selectedImageName ? encodeChannelModel(target.id, selectedImageName) : "";
    next.imageModel = selectedImage;

    const oldModelCapability = modelCapabilityOf(config, config.model);
    const oldModelName = modelOptionName(config.model);
    const oldModelStillExists = next.models.some((value) => modelOptionName(value) === oldModelName);
    if (!config.model || oldModelCapability === "image" || config.model === config.imageModel || !oldModelStillExists) next.model = selectedImage;
    else next.model = validModelValue(next, config.model, oldModelCapability || "text") || config.model;

    next.videoModel = validModelValue(next, config.videoModel, "video");
    next.textModel = validModelValue(next, config.textModel, "text");
    next.audioModel = validModelValue(next, config.audioModel, "audio");
    return next;
}

function clearHostKeys(expectedGeneration?: number) {
    const current = useConfigStore.getState().config;
    replaceConfig(reconcileHostConfig(current, []).config);
    // Persisted config hydration can finish after the host reset arrives. Run
    // the same scrub once more in that case, but never let an earlier reset
    // erase credentials that were accepted for a newer request.
    if (!useConfigStore.persist.hasHydrated()) {
        void waitForConfigHydration().then(() => {
            if (expectedGeneration !== undefined && expectedGeneration !== generation) return;
            replaceConfig(reconcileHostConfig(useConfigStore.getState().config, []).config);
        });
    }
}

async function waitForConfigHydration() {
    if (useConfigStore.persist.hasHydrated()) return;
    await new Promise<void>((resolve) => {
        let unsubscribe: () => void = () => undefined;
        unsubscribe = useConfigStore.persist.onFinishHydration(() => {
            unsubscribe();
            resolve();
        });
        if (useConfigStore.persist.hasHydrated()) {
            unsubscribe();
            resolve();
        }
    });
}

async function processHostTokens(tokens: HostToken[], userId: number) {
    const run = ++generation;
    let requestedChannel: ModelChannel | undefined;
    const requestIsCurrent = () => {
        if (run !== generation) return false;
        if (!requestedChannel) return true;
        const current = useConfigStore.getState().config.channels.find((item) => item.id === requestedChannel?.id);
        return Boolean(
            current &&
            current.apiKey === requestedChannel.apiKey &&
            current.baseUrl === requestedChannel.baseUrl &&
            current.apiFormat === requestedChannel.apiFormat &&
            current.hostUserId === requestedChannel.hostUserId &&
            current.hostTokenId === requestedChannel.hostTokenId,
        );
    };
    try {
        await waitForConfigHydration();
        if (run !== generation) return;
        clearLegacySessionMarker();
        const reconciled = reconcileHostConfig(useConfigStore.getState().config, tokens, userId);
        replaceConfig(reconciled.config);
        useHostBootstrapStore.setState({
            status: "ready",
            error: "",
            modelStatus: reconciled.selectedKey ? "loading" : "idle",
            modelError: reconciled.selectedKey ? "" : canvasText("host.noEnabledKeyDescription"),
            availableImageModels: [],
            userId,
        });
        if (!reconciled.selectedKey) return;

        const currentConfig = useConfigStore.getState().config;
        // The selected key identifies the channel whose catalog we are about
        // to apply.  Falling back to channels[0] here could fetch one channel
        // and then silently write its models into another after a channel
        // change race.
        const channel = currentConfig.channels.find((item) => item.apiKey === reconciled.selectedKey);
        if (!channel) {
            useHostBootstrapStore.setState({
                status: "ready",
                error: "",
                modelStatus: "error",
                modelError: canvasText("host.noModelChannel"),
                availableImageModels: [],
                userId,
            });
            return;
        }
        const savedModels = (Array.isArray(channel.models) ? channel.models : []).filter((model) => model && typeof model.name === "string" && model.name.trim());
        if (savedModels.length) {
            replaceConfig(stampVerifiedKeys(currentConfig));
            useHostBootstrapStore.setState({
                status: "ready",
                error: "",
                modelStatus: "ready",
                modelError: "",
                availableImageModels: savedModels.filter((model) => model.capability === "image").map((model) => ({ name: model.name, capability: "image" as const, supportsImage: true, capabilitySource: "metadata" as const })),
                userId,
            });
            return;
        }
        requestedChannel = channel;
        const catalog = await fetchModelCatalog({
            baseUrl: isEmbedded() ? lockedApiBaseUrl() : channel.baseUrl,
            apiKey: reconciled.selectedKey,
            apiFormat: channel.apiFormat,
        });
        if (!requestIsCurrent()) return;
        const nextConfig = catalog.length ? applyModelCatalog(useConfigStore.getState().config, catalog, channel.id) : clearUnavailableImageConfig(useConfigStore.getState().config);
        replaceConfig(nextConfig);
        const imageModels = catalog.filter((item) => item.supportsImage);
        useHostBootstrapStore.setState({
            status: "ready",
            error: "",
            modelStatus: imageModels.length ? "ready" : "error",
            modelError: imageModels.length ? "" : canvasText("host.noImageModelDescription"),
            availableImageModels: imageModels,
            userId,
        });
    } catch (error) {
        if (!requestIsCurrent()) return;
        replaceConfig(clearUnavailableImageConfig(useConfigStore.getState().config));
        useHostBootstrapStore.setState({
            status: "ready",
            error: "",
            modelStatus: "error",
            modelError: sanitizeHostError(error),
            availableImageModels: [],
            userId,
        });
    }
}

async function handleHostTokenError(error: string, userId: number) {
    const run = ++generation;
    await waitForConfigHydration();
    if (run !== generation) return;
    clearHostKeys();
    useHostBootstrapStore.setState({ status: "error", error: sanitizeHostError(error), modelStatus: "idle", modelError: "", availableImageModels: [], userId });
}

export function retryHostBootstrap() {
    if (!isEmbedded()) return;
    const state = useHostTokensStore.getState();
    if (state.status === "error" || state.status === "idle") {
        lastTokenSignature = "";
        retryHostTokens();
        return;
    }
    if (state.status === "ready") {
        lastTokenSignature = "";
        retryHostTokens();
        return;
    }
    requestHostTokens({ force: true });
}

export function startHostBootstrap() {
    if (!isEmbedded() || started) return;
    started = true;

    if (!hasTrustedEmbeddedOrigin()) {
        ++generation;
        const error = canvasText("host.untrustedOrigin");
        useHostTokensStore.setState({ status: "error", tokens: [], error, userId: 0, requestId: "" });
        useHostBootstrapStore.setState({ status: "error", error, modelStatus: "idle", modelError: "", availableImageModels: [], userId: 0 });
        return;
    }

    const consumeTokenState = (state: ReturnType<typeof useHostTokensStore.getState>) => {
        if (state.status === "idle") {
            // A logout reset has no subsequent loading state. Scrub the old
            // account immediately while retaining canvas data and non-image
            // preferences.
            const run = ++generation;
            lastTokenSignature = "";
            if (state.tokens.length) useHostTokensStore.setState({ tokens: [] });
            clearHostKeys(run);
            return;
        }
        if (state.status === "loading") {
            // Invalidate an in-flight catalog request immediately when the host
            // starts a new token request (account switch or retry).
            const run = ++generation;
            lastTokenSignature = "";
            if (state.tokens.length) useHostTokensStore.setState({ tokens: [] });
            clearHostKeys(run);
            useHostBootstrapStore.setState({ status: "loading", error: "", modelStatus: "idle", modelError: "", availableImageModels: [], userId: state.userId });
            scheduleTokenRequestRecovery(state.requestId);
            return;
        }
        clearTokenRequestRecoveryTimer();
        if (state.status === "error") {
            lastTokenSignature = "";
            void handleHostTokenError(state.error, state.userId);
            return;
        }
        if (state.status !== "ready") return;
        const signature = tokenSignature(state.tokens, state.userId);
        if (signature === lastTokenSignature) return;
        lastTokenSignature = signature;
        void processHostTokens(state.tokens, state.userId);
    };

    // Subscribe before requesting: a synchronous parent response must not be
    // missed between the request and listener registration.
    stopSubscription = useHostTokensStore.subscribe(consumeTokenState);

    // `subscribe` does not invoke the listener for the current value. Consume
    // it explicitly so a remounted iframe can recover an already-ready/error
    // host response instead of waiting forever for another message.
    const initialTokenState = useHostTokensStore.getState();
    consumeTokenState(initialTokenState);
    // A previous iframe instance may have left the bridge in `loading` after
    // its request was lost. Force a fresh request in that case; otherwise the
    // non-force call would simply return the stale request id and leave the
    // new instance waiting forever.
    requestHostTokens({ force: initialTokenState.status === "loading" });
}

export function stopHostBootstrap() {
    clearTokenRequestRecoveryTimer();
    stopSubscription?.();
    stopSubscription = null;
    started = false;
    lastTokenSignature = "";
    ++generation;
    useHostBootstrapStore.setState(emptyHostBootstrapState);
}
