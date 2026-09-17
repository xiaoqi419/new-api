import { act, fireEvent, render, screen, waitFor } from "@testing-library/react";
import "@testing-library/jest-dom/vitest";
import { beforeEach, describe, expect, test, vi } from "vitest";

const fetchChannelModels = vi.hoisted(() => vi.fn());
const message = vi.hoisted(() => ({ success: vi.fn(), error: vi.fn() }));

vi.mock("antd", () => {
    const Input = ({ value, onChange, placeholder, onPressEnter }: { value?: string; onChange?: (event: { target: { value: string } }) => void; placeholder?: string; onPressEnter?: () => void }) => (
        <input value={value} onChange={onChange} placeholder={placeholder} onKeyDown={(event) => event.key === "Enter" && onPressEnter?.()} />
    );
    return {
        App: { useApp: () => ({ message }) },
        Button: ({ children, onClick, disabled }: { children?: React.ReactNode; onClick?: () => void; disabled?: boolean }) => (
            <button type="button" onClick={onClick} disabled={disabled}>
                {children}
            </button>
        ),
        Checkbox: ({ children, checked, onChange }: { children?: React.ReactNode; checked?: boolean; onChange?: (event: { target: { checked: boolean } }) => void }) => (
            <label>
                <input type="checkbox" checked={checked} onChange={(event) => onChange?.({ target: { checked: event.target.checked } })} />
                {children}
            </label>
        ),
        Input,
        Modal: ({ children, open, footer, title }: { children?: React.ReactNode; open?: boolean; footer?: React.ReactNode; title?: React.ReactNode }) =>
            open ? (
                <div role="dialog">
                    <h2>{title}</h2>
                    {children}
                    <div>{footer}</div>
                </div>
            ) : null,
        Tabs: ({ items, onChange }: { items?: Array<{ key: string; label: React.ReactNode }>; onChange?: (key: string) => void }) => (
            <div>
                {items?.map((item) => (
                    <button key={item.key} type="button" onClick={() => onChange?.(item.key)}>
                        {item.label}
                    </button>
                ))}
            </div>
        ),
    };
});

vi.mock("lucide-react", () => ({ RefreshCw: () => null, Search: () => null }));
vi.mock("react-i18next", () => ({
    useTranslation: () => ({
        t: (key: string, options?: { count?: number; selected?: number; total?: number }) => {
            if (key === "config.modelSelect.fetched") return `Fetched ${options?.count ?? 0}`;
            if (key === "config.modelSelect.fetchedTab") return `Fetched tab ${options?.count ?? 0}`;
            if (key === "config.modelSelect.existingTab") return `Existing tab ${options?.count ?? 0}`;
            if (key === "config.modelSelect.visibleSelected") return `${options?.selected ?? 0}/${options?.total ?? 0}`;
            if (key === "config.modelSelect.selected") return `selected ${options?.selected ?? 0}`;
            return key;
        },
    }),
}));
vi.mock("@/services/api/image", () => ({ fetchChannelModels }));

import { ModelSelectModal } from "../model-select-modal";

const channel = {
    id: "default",
    name: "默认渠道",
    baseUrl: "https://aierxin.cc",
    apiKey: "sk-test",
    apiFormat: "openai" as const,
    models: [] as Array<{ name: string; capability: "image" }>,
};

describe("ModelSelectModal fetch and confirm", () => {
    beforeEach(() => {
        fetchChannelModels.mockReset();
        message.success.mockReset();
        message.error.mockReset();
    });

    test("fetches catalog names, lets the user select them, and confirms the selection", async () => {
        fetchChannelModels.mockResolvedValue(["gpt-image-1", "flux-1", "gpt-5.5"]);
        const onConfirm = vi.fn();

        render(<ModelSelectModal open channel={channel} selectedNames={[]} onConfirm={onConfirm} onClose={vi.fn()} />);

        fireEvent.click(screen.getByRole("button", { name: "config.modelSelect.fetch" }));

        await waitFor(() => expect(fetchChannelModels).toHaveBeenCalledWith(channel));
        await waitFor(() => expect(message.success).toHaveBeenCalledWith("Fetched 3"));
        expect(screen.getByText("gpt-image-1")).toBeInTheDocument();
        expect(screen.getByText("flux-1")).toBeInTheDocument();
        expect(screen.getByText("gpt-5.5")).toBeInTheDocument();

        fireEvent.click(screen.getByRole("checkbox", { name: "gpt-image-1" }));
        fireEvent.click(screen.getByRole("checkbox", { name: "flux-1" }));
        fireEvent.click(screen.getByRole("button", { name: "config.modelSelect.confirm" }));

        expect(onConfirm).toHaveBeenCalledWith(["gpt-image-1", "flux-1"]);
    });

    test("does not fetch when the channel is missing a key", async () => {
        render(<ModelSelectModal open channel={{ ...channel, apiKey: "" }} selectedNames={[]} onConfirm={vi.fn()} onClose={vi.fn()} />);

        fireEvent.click(screen.getByRole("button", { name: "config.modelSelect.fetch" }));

        await waitFor(() => expect(message.error).toHaveBeenCalledWith("config.modelSelect.missingConfig"));
        expect(fetchChannelModels).not.toHaveBeenCalled();
    });
});

test.each(["success", "failure"])("ignores a late model-list %s after the draft key changes", async (outcome) => {
    let resolve!: (models: string[]) => void;
    let reject!: (error: Error) => void;
    fetchChannelModels.mockImplementation(
        () =>
            new Promise((yes, no) => {
                resolve = yes;
                reject = no;
            }),
    );
    const props = { open: true, channel, selectedNames: [], onConfirm: vi.fn(), onClose: vi.fn() };
    const view = render(<ModelSelectModal {...props} />);
    fireEvent.click(screen.getByRole("button", { name: "config.modelSelect.fetch" }));
    view.rerender(<ModelSelectModal {...props} channel={{ ...channel, apiKey: "sk-new-group" }} />);
    await act(async () => {
        if (outcome === "success") resolve(["old-group-model"]);
        else reject(new Error("old-group failure"));
    });
    expect(screen.queryByRole("checkbox", { name: "old-group-model" })).not.toBeInTheDocument();
    expect(message.error).not.toHaveBeenCalled();
    expect(message.success).not.toHaveBeenCalled();
});

test("a parent rerender with an equivalent selection preserves fetched choices", async () => {
    fetchChannelModels.mockResolvedValue(["gpt-image-1"]);
    const props = { open: true, channel, selectedNames: [], onConfirm: vi.fn(), onClose: vi.fn() };
    const view = render(<ModelSelectModal {...props} />);
    fireEvent.click(screen.getByRole("button", { name: "config.modelSelect.fetch" }));
    fireEvent.click(await screen.findByRole("checkbox", { name: "gpt-image-1" }));
    view.rerender(<ModelSelectModal {...props} selectedNames={[]} />);
    expect(screen.getByRole("checkbox", { name: "gpt-image-1" })).toBeChecked();
});
