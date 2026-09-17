import axios from "axios";
import { App, ConfigProvider } from "antd";
import { act, fireEvent, render, screen, waitFor } from "@testing-library/react";
import { afterEach, beforeEach, expect, test, vi } from "vitest";
import i18n from "@/i18n";
import { useHostTokensStore, resetHostTokens } from "@/lib/host-bridge";
import { createModelChannel, defaultConfig, useConfigStore } from "@/stores/use-config-store";
import { startHostBootstrap, stopHostBootstrap, useHostBootstrapStore } from "@/lib/host-bootstrap";
import { requestGeneration } from "@/services/api/image";
import { ChannelEditorDrawer } from "../channel-editor-drawer";

const tokens = [
    { id: 1, name: "First group", key: "sk-first" },
    { id: 2, name: "Second group", key: "sk-second" },
];
beforeEach(async () => {
    Object.defineProperty(window, "parent", { configurable: true, value: { postMessage: vi.fn() } });
    await i18n.changeLanguage("en-US");
    useHostTokensStore.setState({ status: "ready", tokens, userId: 7, error: "", requestId: "ready" });
});
afterEach(() => {
    stopHostBootstrap();
    resetHostTokens();
    localStorage.clear();
    Object.defineProperty(window, "parent", { configurable: true, value: window });
    vi.restoreAllMocks();
});

test("unsaved group selection fetches models with its key and survives a background channel replacement", async () => {
    const get = vi.spyOn(axios, "get").mockResolvedValue({ data: { data: [{ id: "gpt-image-1" }] } });
    const onSave = vi.fn();
    const channel = createModelChannel({ id: "default", apiKey: "sk-first", hostTokenId: 1, hostUserId: 7, models: [] });
    const viewFor = (current = channel) => (
        <ConfigProvider theme={{ token: { motion: false } }}>
            <App>
                <ChannelEditorDrawer open channel={current} onSave={onSave} onClose={vi.fn()} />
            </App>
        </ConfigProvider>
    );
    const view = render(viewFor());
    fireEvent.mouseDown(screen.getAllByRole("combobox")[1]);
    fireEvent.click(await screen.findByText("Second group · sk-second"));
    view.rerender(viewFor({ ...channel }));
    expect(screen.getByPlaceholderText("sk-...")).toHaveValue("sk-second");
    fireEvent.click(screen.getByRole("button", { name: /Select models/ }));
    fireEvent.click(await screen.findByRole("button", { name: /Fetch model list/ }));
    await waitFor(() => expect(get).toHaveBeenCalledWith(expect.stringContaining("/models"), expect.objectContaining({ headers: { Authorization: "Bearer sk-second" } })));
    fireEvent.click(await screen.findByRole("checkbox", { name: "gpt-image-1" }));
    // A host update while the selector is open must not reset checked names.
    view.rerender(viewFor({ ...channel }));
    expect(screen.getByRole("checkbox", { name: "gpt-image-1" })).toBeChecked();
    fireEvent.click(screen.getByRole("button", { name: "Confirm" }));
    expect(onSave).not.toHaveBeenCalled();
    fireEvent.click(screen.getByRole("button", { name: "Save" }));
    expect(onSave).toHaveBeenCalledWith(expect.objectContaining({ apiKey: "sk-second", hostTokenId: 2, hostUserId: 7, models: [expect.objectContaining({ name: "gpt-image-1", verifiedKey: "sk-second" })] }));
    useConfigStore.setState({ config: { ...defaultConfig, channels: [onSave.mock.calls[0][0]], model: "default::gpt-image-1", imageModel: "default::gpt-image-1" } });
    await act(async () => {
        await useConfigStore.persist.rehydrate();
    });
    expect(useConfigStore.getState().config.channels[0].apiKey).toBe("");
    startHostBootstrap();
    await waitFor(() => expect(useHostBootstrapStore.getState().modelStatus).toBe("ready"));
    const post = vi.spyOn(axios, "post").mockResolvedValue({ data: { data: [{ b64_json: "aW1hZ2U=" }] } });
    await requestGeneration(useConfigStore.getState().config, "Selected group image");
    expect(post).toHaveBeenCalledWith(expect.stringContaining("/images/generations"), expect.objectContaining({ model: "gpt-image-1" }), expect.objectContaining({ headers: expect.objectContaining({ Authorization: "Bearer sk-second" }) }));
});

test.each(["account", "revoked", "loading"])("an open draft clears credentials when host authorization changes: %s", async (change) => {
    const channel = createModelChannel({ id: "default", apiKey: "sk-second", hostTokenId: 2, hostUserId: 7, models: [] });
    const onSave = vi.fn();
    render(
        <App>
            <ChannelEditorDrawer open channel={channel} onSave={onSave} onClose={vi.fn()} />
        </App>,
    );
    expect(screen.getByPlaceholderText("sk-...")).toHaveValue("sk-second");
    act(() => {
        if (change === "account") useHostTokensStore.setState({ userId: 8, tokens: [{ ...tokens[1], key: "sk-other-account" }] });
        if (change === "revoked") useHostTokensStore.setState({ tokens: [tokens[0]] });
        if (change === "loading") useHostTokensStore.setState({ status: "loading", tokens: [] });
    });
    expect(screen.getByPlaceholderText("sk-...")).toHaveValue("");
    fireEvent.click(screen.getByRole("button", { name: "Cancel" }));
    expect(onSave).not.toHaveBeenCalled();
});

test("saving a manually entered authorized token restores its identity after refresh", async () => {
    vi.spyOn(axios, "get").mockResolvedValue({ data: { data: [{ id: "gpt-image-1" }] } });
    const onSave = vi.fn();
    render(
        <App>
            <ChannelEditorDrawer open channel={createModelChannel({ apiKey: "sk-first" })} onSave={onSave} onClose={vi.fn()} />
        </App>,
    );
    fireEvent.change(screen.getByPlaceholderText("sk-..."), { target: { value: "sk-second" } });
    fireEvent.click(screen.getByRole("button", { name: "Save" }));
    expect(onSave).toHaveBeenCalledWith(expect.objectContaining({ apiKey: "sk-second", hostTokenId: 2, hostUserId: 7 }));
    useConfigStore.setState({ config: { ...defaultConfig, channels: [onSave.mock.calls[0][0]] } });
    await useConfigStore.persist.rehydrate();
    startHostBootstrap();
    await waitFor(() => expect(useHostBootstrapStore.getState().modelStatus).toBe("ready"));
    expect(useConfigStore.getState().config.channels[0].apiKey).toBe("sk-second");
});

test("cancel and reopen discard the unsaved key and restore the saved selection", () => {
    const channel = createModelChannel({ id: "saved", apiKey: "sk-first", hostTokenId: 1, hostUserId: 7 });
    const onSave = vi.fn();
    const props = { channel, onSave, onClose: vi.fn() };
    const view = render(
        <App>
            <ChannelEditorDrawer open {...props} />
        </App>,
    );
    fireEvent.change(screen.getByPlaceholderText("sk-..."), { target: { value: "sk-second" } });
    fireEvent.click(screen.getByRole("button", { name: "Cancel" }));
    view.rerender(
        <App>
            <ChannelEditorDrawer open={false} {...props} />
        </App>,
    );
    view.rerender(
        <App>
            <ChannelEditorDrawer open {...props} />
        </App>,
    );
    expect(screen.getByPlaceholderText("sk-...")).toHaveValue("sk-first");
    expect(onSave).not.toHaveBeenCalled();
});

test.each(["idle", "loading"] as const)("manual key cannot be saved before the pending host identity response: %s", (status) => {
    useHostTokensStore.setState({ status, tokens: [] });
    const onSave = vi.fn();
    render(
        <App>
            <ChannelEditorDrawer open channel={createModelChannel()} onSave={onSave} onClose={vi.fn()} />
        </App>,
    );
    fireEvent.change(screen.getByPlaceholderText("sk-..."), { target: { value: "sk-second" } });
    expect(screen.getByRole("button", { name: "Save" })).toBeDisabled();
    fireEvent.click(screen.getByRole("button", { name: "Save" }));
    expect(onSave).not.toHaveBeenCalled();
    act(() => useHostTokensStore.setState({ status: "ready", tokens, userId: 7 }));
    fireEvent.click(screen.getByRole("button", { name: "Save" }));
    expect(onSave).toHaveBeenCalledWith(expect.objectContaining({ apiKey: "sk-second", hostTokenId: 2, hostUserId: 7 }));
});
