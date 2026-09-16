import { fireEvent, render, screen } from "@testing-library/react";
import "@testing-library/jest-dom/vitest";
import { afterEach, beforeEach, describe, expect, test, vi } from "vitest";

const embeddedState = vi.hoisted(() => ({ value: true }));
const lockedOrigin = vi.hoisted(() => ({ value: "https://aierxin.cc" }));
const hostTokensState = vi.hoisted(() => ({
    status: "ready" as "idle" | "loading" | "ready" | "error",
    tokens: [{ id: 1, name: "Relay", key: "sk-user" }],
    error: "",
    userId: 1,
    requestId: "req-1",
}));

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
        Segmented: ({ value }: { value?: string }) => <div>{value}</div>,
        Select: ({ value, options, onChange, disabled, placeholder }: { value?: string; options?: Array<{ label: string; value: string }>; onChange?: (value: string) => void; disabled?: boolean; placeholder?: string }) => (
            <select value={value || ""} onChange={(event) => onChange?.(event.target.value)} disabled={disabled} aria-label={placeholder || "select"}>
                <option value="">{placeholder || "select"}</option>
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
        t: (key: string, options?: { count?: number }) => {
            if (key === "config.channelEditor.modelDescription") return `${options?.count ?? 0} selected`;
            const values: Record<string, string> = {
                "common.cancel": "Cancel",
                "common.save": "Save",
                "config.channelEditor.title": "Edit provider",
                "config.channelEditor.name": "Provider name",
                "config.channelEditor.protocol": "Protocol",
                "config.channelEditor.baseUrl": "API endpoint",
                "config.channelEditor.apiKey": "API key",
                "config.channelEditor.models": "Provider models",
                "config.channelEditor.selectModels": "Select models",
                "config.channelEditor.hostTokenSelect": "Select token",
                "config.channelEditor.embeddedBaseUrlHint": "Endpoint locked",
            };
            return values[key] || key;
        },
    }),
}));
vi.mock("@/lib/host-bridge", () => ({
    isEmbedded: () => embeddedState.value,
    lockedApiBaseUrl: () => lockedOrigin.value,
    requestHostTokens: vi.fn(),
    useHostTokensStore: () => hostTokensState,
}));
vi.mock("@/stores/use-config-store", () => ({
    defaultBaseUrlForApiFormat: () => "https://api.openai.com/v1",
    guessCapability: (name: string) => (name.includes("image") || name.includes("flux") ? "image" : "text"),
    normalizeChannelModels: (models: unknown[]) => models,
}));
vi.mock("../model-script-editor", () => ({ ModelScriptEditor: () => null }));
vi.mock("../model-select-modal", () => ({
    ModelSelectModal: ({ open, onConfirm }: { open?: boolean; onConfirm: (names: string[]) => void }) =>
        open ? (
            <button type="button" onClick={() => onConfirm(["gpt-image-1", "flux-1"])}>
                Apply fetched models
            </button>
        ) : null,
}));

import { ChannelEditorDrawer } from "../channel-editor-drawer";

const emptyChannel = {
    id: "default",
    name: "默认渠道",
    baseUrl: "https://aierxin.cc",
    apiKey: "sk-user",
    apiFormat: "openai" as const,
    models: [] as Array<{ name: string; capability: "image" | "text"; verified?: boolean; verifiedKey?: string }>,
};

describe("ChannelEditorDrawer model save", () => {
    beforeEach(() => {
        embeddedState.value = true;
        lockedOrigin.value = "https://aierxin.cc";
        Object.defineProperty(window, "parent", { configurable: true, value: {} });
    });

    afterEach(() => {
        vi.clearAllMocks();
        Object.defineProperty(window, "parent", { configurable: true, value: window });
    });

    test("saves fetched selected models with a non-zero count and verification markers", () => {
        const onSave = vi.fn();

        render(<ChannelEditorDrawer open channel={emptyChannel} onSave={onSave} onClose={vi.fn()} />);

        expect(screen.getByText("0 selected")).toBeInTheDocument();
        fireEvent.click(screen.getByRole("button", { name: "Select models" }));
        fireEvent.click(screen.getByRole("button", { name: "Apply fetched models" }));
        expect(screen.getByText("2 selected")).toBeInTheDocument();
        expect(screen.getByText("gpt-image-1")).toBeInTheDocument();
        expect(screen.getByText("flux-1")).toBeInTheDocument();

        fireEvent.click(screen.getByRole("button", { name: "Save" }));

        expect(onSave).toHaveBeenCalledTimes(1);
        const saved = onSave.mock.calls[0][0];
        expect(saved.models).toHaveLength(2);
        expect(saved.models).toEqual([expect.objectContaining({ name: "gpt-image-1", verified: true, verifiedKey: "sk-user" }), expect.objectContaining({ name: "flux-1", verified: true, verifiedKey: "sk-user" })]);
    });
});
