import { Button, Drawer, Input, Segmented, Select, Space } from "antd";
import { ListPlus, Trash2 } from "lucide-react";
import { useCallback, useEffect, useRef, useState } from "react";
import { useTranslation } from "react-i18next";

import { isEmbedded, lockedApiBaseUrl, requestHostTokens, useHostTokensStore, type HostTokensState } from "@/lib/host-bridge";
import { defaultBaseUrlForApiFormat, guessCapability, normalizeChannelModels, type ApiCallFormat, type ChannelModel, type ModelCapability, type ModelChannel } from "@/stores/use-config-store";
import { ModelScriptEditor } from "./model-script-editor";
import { ModelSelectModal } from "./model-select-modal";

type ScriptTarget = { name: string; capability: ModelCapability; value: string };

function maskKey(key: string) {
    return key.length > 12 ? `${key.slice(0, 7)}…${key.slice(-4)}` : key;
}

function HostTokenPicker({ tokens, value, onPick, t }: { tokens: HostTokensState; value: string; onPick: (key: string) => void; t: (key: string, options?: Record<string, unknown>) => string }) {
    if (tokens.status === "error") {
        return <div className="mb-2 text-xs text-amber-600 dark:text-amber-500">{t("config.channelEditor.hostTokenReadFailed", { error: tokens.error })}</div>;
    }
    if (tokens.status === "ready" && !tokens.tokens.length) {
        return <div className="mb-2 text-xs text-stone-500">{t("config.channelEditor.hostTokenEmpty")}</div>;
    }
    return (
        <Select
            className="mb-2 w-full"
            loading={tokens.status === "loading"}
            disabled={tokens.status !== "ready"}
            value={tokens.tokens.some((token) => token.key === value) ? value : undefined}
            placeholder={tokens.status === "loading" ? t("config.channelEditor.hostTokenLoading") : t("config.channelEditor.hostTokenSelect")}
            options={tokens.tokens.map((token) => ({ label: `${token.name} · ${maskKey(token.key)}`, value: token.key }))}
            onChange={onPick}
        />
    );
}

export function ChannelEditorDrawer({ open, channel, onSave, onClose }: { open: boolean; channel: ModelChannel | null; onSave: (channel: ModelChannel) => void; onClose: () => void }) {
    const { t } = useTranslation();
    const embedded = isEmbedded();
    const lockedBaseUrl = embedded ? lockedApiBaseUrl() : "";
    const embeddedOriginUnavailable = embedded && !lockedBaseUrl;
    const sanitizeDraft = useCallback(
        (value: ModelChannel): ModelChannel =>
            embedded
                ? {
                      ...value,
                      // An embedded document must never retain an endpoint or key
                      // when its origin is opaque and cannot be authenticated.
                      baseUrl: lockedBaseUrl,
                      apiKey: lockedBaseUrl ? value.apiKey : "",
                      models: lockedBaseUrl ? value.models : value.models.map((model) => ({ ...model, verified: false, verifiedKey: "" })),
                  }
                : value,
        [embedded, lockedBaseUrl],
    );
    const [draft, setDraft] = useState<ModelChannel | null>(() => (channel ? sanitizeDraft(channel) : null));
    const [selectOpen, setSelectOpen] = useState(false);
    const [scriptTarget, setScriptTarget] = useState<ScriptTarget | null>(null);
    const hostTokens = useHostTokensStore();
    const waitingForHostTokens = embedded && (hostTokens.status === "loading" || hostTokens.status === "idle");
    const editorSession = useRef<{ id: string; open: boolean }>({ id: "", open: false });
    const draftUserId = useRef(hostTokens.userId);
    const apiFormatOptions: Array<{ label: string; value: ApiCallFormat }> = [
        { label: "OpenAI", value: "openai" },
        { label: "Gemini", value: "gemini" },
    ];
    const capabilityOptions: Array<{ label: string; value: ModelCapability }> = ["image", "video", "text", "audio"].map((value) => ({ label: t(`config.channelEditor.capabilities.${value}`), value: value as ModelCapability }));

    useEffect(() => {
        if (open && channel && (!editorSession.current.open || editorSession.current.id !== channel.id)) {
            setDraft(sanitizeDraft(channel));
            setSelectOpen(false);
            setScriptTarget(null);
        }
        editorSession.current = { id: channel?.id || "", open };
    }, [open, channel, sanitizeDraft]);

    useEffect(() => {
        const accountChanged = draftUserId.current !== hostTokens.userId;
        draftUserId.current = hostTokens.userId;
        if (!embedded) return;
        setDraft((current) => {
            if (!current) return current;
            const token = hostTokens.tokens.find((item) => item.id === current.hostTokenId && current.hostUserId === hostTokens.userId);
            const unavailable = !lockedBaseUrl || accountChanged || hostTokens.status !== "ready" || (current.hostTokenId !== undefined && !token);
            const apiKey = unavailable ? "" : token?.key || current.apiKey;
            if (current.baseUrl === lockedBaseUrl && current.apiKey === apiKey && !(unavailable && current.models.some((model) => model.verifiedKey))) return current;
            return { ...current, baseUrl: lockedBaseUrl, apiKey, models: current.models.map((model) => ({ ...model, verified: false, verifiedKey: "" })) };
        });
    }, [open, channel?.id, embedded, lockedBaseUrl, hostTokens.status, hostTokens.userId, hostTokens.tokens]);

    useEffect(() => {
        if (open && lockedBaseUrl) requestHostTokens();
    }, [open, lockedBaseUrl]);

    if (!draft) return null;

    const patch = (value: Partial<ModelChannel>) => setDraft((current) => (current ? { ...current, ...value } : current));
    const setModels = (models: ChannelModel[]) => patch({ models });

    const changeApiFormat = (apiFormat: ApiCallFormat) => {
        if (lockedBaseUrl) {
            patch({ apiFormat, baseUrl: lockedBaseUrl });
            return;
        }
        const baseUrl = !draft.baseUrl.trim() || draft.baseUrl.trim() === defaultBaseUrlForApiFormat(draft.apiFormat) ? defaultBaseUrlForApiFormat(apiFormat) : draft.baseUrl;
        patch({ apiFormat, baseUrl });
    };

    const applySelection = (names: string[]) => {
        const map = new Map(draft.models.map((model) => [model.name, model]));
        setModels(
            names.map((name) => {
                const previous = map.get(name);
                return {
                    name,
                    capability: previous?.capability || guessCapability(name),
                    script: previous?.script,
                    verified: true,
                    verifiedKey: draft.apiKey,
                };
            }),
        );
    };

    const setCapability = (name: string, capability: ModelCapability) => setModels(draft.models.map((model) => (model.name === name ? { ...model, capability } : model)));
    const setScript = (name: string, script: string) => setModels(draft.models.map((model) => (model.name === name ? { ...model, script: script || undefined } : model)));
    const removeModel = (name: string) => setModels(draft.models.filter((model) => model.name !== name));

    const save = () => {
        // An opaque embedded frame has no trustworthy host origin. Do not
        // persist a manually entered endpoint or key, and do not close the
        // drawer as if the save succeeded.
        if (embeddedOriginUnavailable || waitingForHostTokens) return;
        const token = embedded && hostTokens.status === "ready" ? hostTokens.tokens.find((item) => item.key === draft.apiKey.trim()) : undefined;
        onSave({
            ...draft,
            ...(token ? { hostTokenId: token.id, hostUserId: hostTokens.userId } : {}),
            name: draft.name.trim() || t("config.channels.unnamed"),
            baseUrl: embedded ? lockedBaseUrl : draft.baseUrl.trim(),
            apiKey: embedded ? draft.apiKey.trim() : draft.apiKey,
            models: normalizeChannelModels(draft.models),
        });
        onClose();
    };

    return (
        <Drawer
            open={open}
            width={640}
            title={t("config.channelEditor.title")}
            onClose={onClose}
            styles={{ body: { paddingTop: 16 } }}
            extra={
                <Space>
                    <Button onClick={onClose}>{t("common.cancel")}</Button>
                    <Button type="primary" disabled={embeddedOriginUnavailable || waitingForHostTokens} onClick={save}>
                        {t("common.save")}
                    </Button>
                </Space>
            }
        >
            <div className="grid gap-4 md:grid-cols-2">
                <label className="block">
                    <span className="mb-1 block text-sm font-medium">{t("config.channelEditor.name")}</span>
                    <Input value={draft.name} onChange={(event) => patch({ name: event.target.value })} />
                </label>
                <label className="block">
                    <span className="mb-1 block text-sm font-medium">{t("config.channelEditor.protocol")}</span>
                    <Select className="w-full" value={draft.apiFormat} options={lockedBaseUrl ? apiFormatOptions : apiFormatOptions} onChange={changeApiFormat} />
                </label>
                <label className="block md:col-span-2">
                    <span className="mb-1 block text-sm font-medium">{t("config.channelEditor.baseUrl")}</span>
                    <Input value={embedded ? lockedBaseUrl : draft.baseUrl} disabled={embedded} onChange={(event) => patch({ baseUrl: event.target.value })} placeholder="https://api.example.com" />
                    {embeddedOriginUnavailable ? (
                        <span role="alert" className="mt-1 block text-xs text-amber-600 dark:text-amber-500">
                            {t("config.channelEditor.embeddedOriginUnavailable")}
                        </span>
                    ) : null}
                    {lockedBaseUrl ? <span className="mt-1 block text-xs text-stone-500">{t("config.channelEditor.embeddedBaseUrlHint")}</span> : null}
                </label>
                <label className="block md:col-span-2">
                    <span className="mb-1 block text-sm font-medium">{t("config.channelEditor.apiKey")}</span>
                    {lockedBaseUrl ? (
                        <HostTokenPicker
                            tokens={hostTokens}
                            value={draft.apiKey}
                            onPick={(apiKey) =>
                                patch({ apiKey, hostTokenId: hostTokens.tokens.find((token) => token.key === apiKey)?.id, hostUserId: hostTokens.userId, models: draft.models.map((model) => ({ ...model, verified: false, verifiedKey: "" })) })
                            }
                            t={t}
                        />
                    ) : null}
                    <Input.Password
                        value={embeddedOriginUnavailable ? "" : draft.apiKey}
                        disabled={embeddedOriginUnavailable}
                        onChange={(event) => patch({ apiKey: event.target.value, hostTokenId: undefined, hostUserId: undefined, models: draft.models.map((model) => ({ ...model, verified: false, verifiedKey: "" })) })}
                        placeholder="sk-..."
                    />
                </label>
            </div>

            <div className="mt-6 mb-3 flex flex-wrap items-center justify-between gap-2">
                <div>
                    <div className="text-sm font-semibold">{t("config.channelEditor.models")}</div>
                    <div className="mt-0.5 text-xs text-stone-500">{t("config.channelEditor.modelDescription", { count: draft.models.length })}</div>
                </div>
                <Button type="primary" icon={<ListPlus className="size-4" />} onClick={() => setSelectOpen(true)}>
                    {t("config.channelEditor.selectModels")}
                </Button>
            </div>

            <div className="space-y-2 rounded-lg border border-stone-200 p-2 dark:border-stone-800">
                {draft.models.length ? (
                    draft.models.map((model) => (
                        <div key={model.name} className="flex flex-wrap items-center gap-3 rounded-md px-2 py-1.5 hover:bg-stone-50 dark:hover:bg-stone-900/40">
                            <span className="min-w-0 flex-1 truncate text-sm" title={model.name}>
                                {model.name}
                            </span>
                            <div className="flex shrink-0 items-center gap-2">
                                <Segmented size="small" value={model.capability} options={capabilityOptions} onChange={(value) => setCapability(model.name, value as ModelCapability)} />
                                <Button size="small" type={model.script ? "primary" : "default"} ghost={Boolean(model.script)} onClick={() => setScriptTarget({ name: model.name, capability: model.capability, value: model.script || "" })}>
                                    {t(model.script ? "config.channelEditor.scriptReady" : "config.channelEditor.script")}
                                </Button>
                                <Button size="small" danger type="text" icon={<Trash2 className="size-3.5" />} onClick={() => removeModel(model.name)} />
                            </div>
                        </div>
                    ))
                ) : (
                    <div className="px-2 py-8 text-center text-sm text-stone-500">{t("config.channelEditor.empty")}</div>
                )}
            </div>

            <ModelSelectModal open={selectOpen} channel={draft} selectedNames={draft.models.map((model) => model.name)} onConfirm={applySelection} onClose={() => setSelectOpen(false)} />

            <ModelScriptEditor
                open={Boolean(scriptTarget)}
                capability={scriptTarget?.capability || "text"}
                modelName={scriptTarget?.name || ""}
                value={scriptTarget?.value || ""}
                onSave={(script) => scriptTarget && setScript(scriptTarget.name, script)}
                onClose={() => setScriptTarget(null)}
            />
        </Drawer>
    );
}
