import { fireEvent, render, screen } from "@testing-library/react";
import "@testing-library/jest-dom/vitest";
import { afterEach, beforeEach, describe, expect, test, vi } from "vitest";

const embeddedState = vi.hoisted(() => ({ value: false }));
const lockedOrigin = vi.hoisted(() => ({ value: "" }));
const hostTokensState = vi.hoisted(() => ({
    status: "idle" as "idle" | "loading" | "ready" | "error",
    tokens: [] as Array<{ id: number; name: string; key: string }>,
    error: "",
    userId: 0,
    requestId: "",
}));
const requestHostTokens = vi.hoisted(() => vi.fn());

vi.mock("antd", () => {
    const Input = ({ value, onChange, disabled, placeholder, type = "text" }: { value?: string; onChange?: (event: { target: { value: string } }) => void; disabled?: boolean; placeholder?: string; type?: string }) => (
        <input value={value} onChange={onChange} disabled={disabled} placeholder={placeholder} type={type} />
    );
    Input.Password = Input;
    return {
        Button: ({ children, onClick, disabled, type }: { children?: React.ReactNode; onClick?: () => void; disabled?: boolean; type?: string }) => (
            <button type="button" onClick={onClick} disabled={disabled} data-button-type={type}>
                {children}
            </button>
        ),
        Drawer: ({ children, open, title, extra }: { children?: React.ReactNode; open?: boolean; title?: React.ReactNode; extra?: React.ReactNode }) =>
            open ? (
                <aside>
                    <h2>{title}</h2>
                    {extra}
                    {children}
                </aside>
            ) : null,
        Input,
        Segmented: ({ value, options }: { value?: string; options?: Array<{ label: string; value: string }> }) => (
            <select value={value} onChange={() => undefined} aria-label="capability">
                {options?.map((option) => (
                    <option key={option.value} value={option.value}>
                        {option.label}
                    </option>
                ))}
            </select>
        ),
        Select: ({ value, options, onChange, disabled, placeholder }: { value?: string; options?: Array<{ label: string; value: string }>; onChange?: (value: string) => void; disabled?: boolean; placeholder?: string }) => (
            <select value={value || ""} onChange={(event) => onChange?.(event.target.value)} disabled={disabled} aria-label={placeholder || "select"}>
                <option value="" disabled>
                    {placeholder || "select"}
                </option>
                {options?.map((option) => (
                    <option key={option.value} value={option.value}>
                        {option.label}
                    </option>
                ))}
            </select>
        ),
        Space: ({ children }: { children?: React.ReactNode }) => <div>{children}</div>,
    };
});

vi.mock("lucide-react", () => ({ ListPlus: () => null, Trash2: () => null }));
vi.mock("react-i18next", () => ({
    useTranslation: () => ({
        t: (key: string, options?: { count?: number; error?: string }) => {
            const values: Record<string, string> = {
                "common.cancel": "Cancel",
                "common.save": "Save",
                "config.channels.unnamed": "Unnamed provider",
                "config.channelEditor.title": "Edit provider",
                "config.channelEditor.name": "Provider name",
                "config.channelEditor.protocol": "Protocol",
                "config.channelEditor.baseUrl": "API endpoint",
                "config.channelEditor.apiKey": "API key",
                "config.channelEditor.models": "Provider models",
                "config.channelEditor.modelDescription": `${options?.count || 0} selected`,
                "config.channelEditor.selectModels": "Select models",
                "config.channelEditor.empty": "No models",
                "config.channelEditor.script": "Request script",
                "config.channelEditor.scriptReady": "Script set",
                "config.channelEditor.hostTokenReadFailed": `Token read failed (${options?.error || ""})`,
                "config.channelEditor.hostTokenEmpty": "No tokens",
                "config.channelEditor.hostTokenLoading": "Loading tokens",
                "config.channelEditor.hostTokenSelect": "Select token",
                "config.channelEditor.embeddedOriginUnavailable": "Embedded origin unavailable",
                "config.channelEditor.embeddedBaseUrlHint": "Endpoint locked",
                "config.channelEditor.capabilities.image": "Image",
                "config.channelEditor.capabilities.video": "Video",
                "config.channelEditor.capabilities.text": "Text",
                "config.channelEditor.capabilities.audio": "Audio",
            };
            return values[key] || key;
        },
    }),
}));
vi.mock("@/lib/host-bridge", () => ({
    isEmbedded: () => embeddedState.value,
    lockedApiBaseUrl: () => lockedOrigin.value,
    requestHostTokens,
    useHostTokensStore: () => hostTokensState,
}));
vi.mock("@/stores/use-config-store", () => ({
    defaultBaseUrlForApiFormat: () => "https://api.openai.com/v1",
    guessCapability: () => "text",
    normalizeChannelModels: (models: unknown[]) => models,
}));
vi.mock("../model-script-editor", () => ({ ModelScriptEditor: () => null }));
vi.mock("../model-select-modal", () => ({ ModelSelectModal: () => null }));

import { ChannelEditorDrawer } from "../channel-editor-drawer";

const channel = {
    id: "channel-1",
    name: "Primary",
    baseUrl: "https://provider.example/v1",
    apiKey: "manual-secret",
    apiFormat: "openai" as const,
    models: [{ name: "gpt-test", capability: "text" as const }],
};

beforeEach(() => {
    embeddedState.value = false;
    lockedOrigin.value = "";
    hostTokensState.status = "idle";
    hostTokensState.tokens = [];
    hostTokensState.error = "";
    requestHostTokens.mockClear();
});

afterEach(() => {
    vi.clearAllMocks();
});

describe("ChannelEditorDrawer endpoint and key isolation", () => {
    test("fails closed for an opaque embedded origin and never saves the draft key", () => {
        embeddedState.value = true;
        const onSave = vi.fn();
        const onClose = vi.fn();

        render(<ChannelEditorDrawer open channel={channel} onSave={onSave} onClose={onClose} />);

        const inputs = screen.getAllByRole("textbox");
        expect(inputs[1]).toHaveValue("");
        expect(inputs[1]).toBeDisabled();
        expect(inputs[2]).toHaveValue("");
        expect(inputs[2]).toBeDisabled();
        expect(screen.getByRole("alert")).toHaveTextContent("Embedded origin unavailable");

        const saveButton = screen.getByRole("button", { name: "Save" });
        expect(saveButton).toBeDisabled();
        fireEvent.click(saveButton);
        expect(onSave).not.toHaveBeenCalled();
        expect(onClose).not.toHaveBeenCalled();
        expect(requestHostTokens).not.toHaveBeenCalled();
    });

    test("allows a same-origin embedded frame to use a host token or manual key", () => {
        embeddedState.value = true;
        lockedOrigin.value = "https://new-api.example";
        hostTokensState.status = "ready";
        hostTokensState.tokens = [{ id: 7, name: "Relay", key: "host-token" }];
        const onSave = vi.fn();

        render(<ChannelEditorDrawer open channel={channel} onSave={onSave} onClose={vi.fn()} />);

        const inputs = screen.getAllByRole("textbox");
        expect(inputs[1]).toHaveValue("https://new-api.example");
        expect(inputs[1]).toBeDisabled();
        expect(inputs[2]).toHaveValue("manual-secret");
        expect(inputs[2]).not.toBeDisabled();
        expect(screen.getByRole("combobox", { name: "Select token" })).toBeEnabled();
        expect(requestHostTokens).toHaveBeenCalledTimes(1);

        fireEvent.change(inputs[2], { target: { value: "manual-updated" } });
        fireEvent.click(screen.getByRole("button", { name: "Save" }));
        expect(onSave).toHaveBeenCalledWith(expect.objectContaining({ baseUrl: "https://new-api.example", apiKey: "manual-updated" }));
    });

    test("accepts a token supplied by the trusted host", () => {
        embeddedState.value = true;
        lockedOrigin.value = "https://new-api.example";
        hostTokensState.status = "ready";
        hostTokensState.tokens = [{ id: 7, name: "Relay", key: "host-token" }];
        const onSave = vi.fn();

        render(<ChannelEditorDrawer open channel={{ ...channel, apiKey: "" }} onSave={onSave} onClose={vi.fn()} />);

        fireEvent.change(screen.getByRole("combobox", { name: "Select token" }), { target: { value: "host-token" } });
        fireEvent.click(screen.getByRole("button", { name: "Save" }));
        expect(onSave).toHaveBeenCalledWith(expect.objectContaining({ baseUrl: "https://new-api.example", apiKey: "host-token" }));
    });

    test("preserves standalone endpoint and key behavior", () => {
        const onSave = vi.fn();

        render(<ChannelEditorDrawer open channel={channel} onSave={onSave} onClose={vi.fn()} />);

        const inputs = screen.getAllByRole("textbox");
        expect(inputs[1]).toHaveValue(channel.baseUrl);
        expect(inputs[1]).not.toBeDisabled();
        expect(inputs[2]).toHaveValue(channel.apiKey);
        expect(inputs[2]).not.toBeDisabled();
        expect(requestHostTokens).not.toHaveBeenCalled();

        fireEvent.click(screen.getByRole("button", { name: "Save" }));
        expect(onSave).toHaveBeenCalledWith(expect.objectContaining({ baseUrl: channel.baseUrl, apiKey: channel.apiKey }));
    });
});

test("an open editor clears its secret when the embedded origin becomes opaque", () => {
    embeddedState.value = true;
    lockedOrigin.value = "https://new-api.example";
    hostTokensState.status = "ready";
    hostTokensState.tokens = [{ id: 7, name: "Relay", key: "host-token" }];
    const props = { open: true, channel, onSave: vi.fn(), onClose: vi.fn() };
    const view = render(<ChannelEditorDrawer {...props} />);
    expect(screen.getByPlaceholderText("sk-...")).toHaveValue("manual-secret");
    lockedOrigin.value = "";
    view.rerender(<ChannelEditorDrawer {...props} />);
    expect(screen.getByPlaceholderText("sk-...")).toHaveValue("");
    expect(screen.getByRole("button", { name: "Save" })).toBeDisabled();
});
