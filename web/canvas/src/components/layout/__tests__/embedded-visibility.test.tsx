import { cleanup, render, screen, waitFor } from "@testing-library/react";
import type { ReactNode } from "react";
import "@testing-library/jest-dom/vitest";
import { afterEach, beforeEach, describe, expect, test, vi } from "vitest";

const agentState = vi.hoisted(() => ({
    token: "stored-agent-token",
    enabled: false,
    connected: false,
    panelOpen: false,
}));

const connectAgent = vi.hoisted(() => vi.fn());
const togglePanel = vi.hoisted(() => vi.fn());
const openConfigDialog = vi.hoisted(() => vi.fn());
const configState = vi.hoisted(() => ({
    isConfigOpen: false,
    channels: [] as Array<{ apiKey: string; models: Array<{ name: string }> }>,
}));

vi.mock("react-router-dom", () => ({
    Link: ({ to, children, ...props }: { to: string; children?: ReactNode; [key: string]: unknown }) => (
        <a href={to} {...props}>
            {children}
        </a>
    ),
    useLocation: () => ({ pathname: "/" }),
}));

vi.mock("antd", () => ({
    Button: ({ children, icon, ...props }: { children?: ReactNode; icon?: ReactNode; [key: string]: unknown }) => (
        <button {...props}>
            {icon}
            {children}
        </button>
    ),
    Alert: ({ message, description, action, type }: { message?: ReactNode; description?: ReactNode; action?: ReactNode; type?: string }) => (
        <div role="alert" data-alert-type={type}>
            <strong>{message}</strong>
            <div>{description}</div>
            {action}
        </div>
    ),
    Drawer: ({ children, open, title }: { children?: ReactNode; open?: boolean; title?: ReactNode }) =>
        open ? (
            <aside>
                <h2>{title}</h2>
                {children}
            </aside>
        ) : null,
    Dropdown: ({ children, menu }: { children?: ReactNode; menu?: { items?: Array<{ key?: string; label?: ReactNode; type?: string }> } }) => (
        <div>
            {children}
            <div data-testid="dropdown-menu">
                {(menu?.items || [])
                    .filter((item) => item.type !== "divider")
                    .map((item) => (
                        <span key={item.key}>{item.label}</span>
                    ))}
            </div>
        </div>
    ),
    Modal: ({ children, open }: { children?: ReactNode; open?: boolean }) => (open ? <div role="dialog">{children}</div> : null),
    Tooltip: ({ children, title }: { children?: ReactNode; title?: ReactNode }) => <span title={typeof title === "string" ? title : undefined}>{children}</span>,
}));

vi.mock("@/stores/use-agent-store", () => ({
    useAgentStore: (selector: (state: typeof agentState & { connectAgent: typeof connectAgent; togglePanel: typeof togglePanel }) => unknown) => selector({ ...agentState, connectAgent, togglePanel }),
}));

vi.mock("@/stores/use-config-store", () => ({
    useConfigStore: (selector: (state: { openConfigDialog: typeof openConfigDialog; isConfigOpen: boolean; config: { channels: typeof configState.channels } }) => unknown) =>
        selector({ openConfigDialog, isConfigOpen: configState.isConfigOpen, config: { channels: configState.channels } }),
}));

vi.mock("@/stores/use-theme-store", () => ({
    useThemeStore: (selector: (state: { theme: "light"; setTheme: () => void }) => unknown) => selector({ theme: "light", setTheme: vi.fn() }),
}));

vi.mock("@/components/layout/app-config-modal", () => ({ AppConfigModal: () => <div data-testid="config-modal" /> }));
vi.mock("@/components/agent/agent-panel", () => ({
    AgentPanel: () => <aside data-testid="agent-panel">Agent panel</aside>,
}));
vi.mock("@/components/layout/github-link", () => ({
    GitHubLink: () => (
        <a data-testid="github-link" href="https://github.com/basketikun/infinite-canvas">
            GitHub
        </a>
    ),
}));
vi.mock("@/components/layout/version-release-modal", () => ({ VersionReleaseModal: () => <button data-testid="version-control">v0.18.0</button> }));
vi.mock("@/components/ui/animated-theme-toggler", () => ({ AnimatedThemeToggler: () => <button data-testid="theme-control">theme</button> }));
vi.mock("@/lib/canvas-theme", () => ({ canvasThemes: { light: { node: { text: "#111" }, toolbar: { border: "#222", panel: "#fff", activeBg: "#eee" } } } }));
vi.mock("@/constant/env", () => ({ APP_VERSION: "v0.18.0", DOCS_URL: "https://docs.example.test" }));

vi.mock("react-i18next", () => ({
    initReactI18next: { type: "3rdParty", init: () => undefined },
    useTranslation: () => ({
        i18n: { resolvedLanguage: "zh-CN" },
        t: (key: string) =>
            ({
                "topNav.openAgent": "打开 Agent",
                "topNav.closeAgent": "收起 Agent",
                "topNav.docs": "文档",
                "topNav.plugins": "插件",
                "topNav.shortcuts": "快捷键",
                "topNav.navigation": "导航",
                "topNav.openMenu": "打开菜单",
                "topNav.menu": "菜单",
                "navigation.canvas": "画布",
                "navigation.image": "生图",
                "navigation.video": "视频",
                "navigation.prompts": "提示词",
                "navigation.assets": "资产",
                "navigation.config": "配置",
                "canvas.home": "首页",
                "canvas.docs": "文档",
                "canvas.projects": "项目",
                "canvas.create": "新建",
                "canvas.deleteCurrent": "删除当前",
                "canvas.importAsset": "导入",
                "canvas.exportCurrent": "导出",
                "canvas.undo": "撤销",
                "canvas.redo": "重做",
                "canvas.openMenu": "打开画布菜单",
                "canvas.collapsePanel": "收起面板",
                "canvas.expandPanel": "展开面板",
                "canvas.shortcuts": "快捷键",
                "topNav.switchLanguage": "切换语言",
                "locale.zhCN": "中文",
                "locale.enUS": "English",
                "agent.panel.resize": "调整右侧面板宽度",
                "topNav.darkTheme": "深色主题",
                "topNav.lightTheme": "浅色主题",
                "host.keyLoadFailed": "读取当前账号 API Key 失败",
                "host.keyLoadFailedDescription": "请稍后重试，或前往 API 密钥页面检查账号状态。",
                "host.noEnabledKey": "当前账号没有启用的 API Key",
                "host.noEnabledKeyDescription": "画布仍可浏览；创建或启用 API Key 后即可调用图片模型。",
                "host.modelCheckRequired": "图片模型配置需要检查",
                "host.noImageModel": "当前 API Key 没有可用的图片模型。",
                "host.noImageModelDescription": "当前 API Key 没有可用的图片模型，请在渠道设置中检查模型能力。",
                "host.retry": "重试",
                "host.manageKeys": "管理 API 密钥",
            })[key] || key,
    }),
}));

import { AppTopNav } from "../app-top-nav";
import { MobileNavDrawer } from "../mobile-nav-drawer";
import { CanvasTopBar } from "@/components/canvas/canvas-top-bar";
import UserLayout from "@/layouts/user-layout";
import { useHostTokensStore } from "@/lib/host-bridge";
import { useHostBootstrapStore } from "@/lib/host-bootstrap";

function setEmbedded(embedded: boolean) {
    Object.defineProperty(window, "parent", { configurable: true, value: embedded ? {} : window });
}

beforeEach(() => {
    setEmbedded(false);
    connectAgent.mockClear();
    togglePanel.mockClear();
    openConfigDialog.mockClear();
    configState.isConfigOpen = false;
    configState.channels = [];
    agentState.token = "stored-agent-token";
    agentState.enabled = false;
    agentState.connected = false;
    agentState.panelOpen = false;
    useHostTokensStore.setState({ status: "idle", tokens: [], error: "", userId: 0, requestId: "" });
    useHostBootstrapStore.setState({ status: "idle", error: "", modelStatus: "idle", modelError: "", availableImageModels: [], userId: 0 });
});

afterEach(() => {
    cleanup();
    setEmbedded(false);
});

describe("embedded navigation visibility", () => {
    test("hides Agent, documentation, and GitHub while retaining configuration and version controls", async () => {
        setEmbedded(true);

        render(<AppTopNav />);

        expect(screen.queryByRole("button", { name: "打开 Agent" })).toBeNull();
        expect(screen.queryByTestId("github-link")).toBeNull();
        expect(screen.queryByRole("link", { name: "文档" })).toBeNull();
        expect(screen.getByRole("button", { name: "配置" })).toBeInTheDocument();
        expect(screen.getByTestId("version-control")).toBeInTheDocument();

        await waitFor(() => expect(connectAgent).toHaveBeenCalledTimes(0));
    });

    test("keeps standalone controls and silently connects a configured Agent", async () => {
        render(<AppTopNav />);

        expect(screen.getByRole("button", { name: "打开 Agent" })).toBeInTheDocument();
        expect(screen.getByTestId("github-link")).toBeInTheDocument();
        expect(screen.getByRole("link", { name: "文档" })).toBeInTheDocument();
        expect(screen.getByRole("button", { name: "配置" })).toBeInTheDocument();

        await waitFor(() => expect(connectAgent).toHaveBeenCalledWith({ silent: true }));
    });

    test.each([true, false])("filters the standalone video entry only when embedded=%s", (embedded) => {
        setEmbedded(embedded);

        render(<MobileNavDrawer open activeToolSlug="canvas" onClose={() => undefined} />);

        const videoLink = screen.queryByRole("link", { name: "视频" });
        if (embedded) expect(videoLink).toBeNull();
        else expect(videoLink).toHaveAttribute("href", "/video");
    });

    test("removes canvas-menu documentation and Agent controls while embedded", () => {
        setEmbedded(true);

        render(
            <CanvasTopBar
                title="Demo"
                titleDraft="Demo"
                isTitleEditing={false}
                onTitleDraftChange={() => undefined}
                onStartTitleEditing={() => undefined}
                onFinishTitleEditing={() => undefined}
                onCancelTitleEditing={() => undefined}
                canUndo={false}
                canRedo={false}
                onHome={() => undefined}
                onProjects={() => undefined}
                onCreateProject={() => undefined}
                onDeleteProject={() => undefined}
                onExportProject={() => undefined}
                onImportImage={() => undefined}
                onOpenPlugins={() => undefined}
                onUndo={() => undefined}
                onRedo={() => undefined}
                agentOpen={false}
                compactAgentStatus={{ connected: false, enabled: false, activity: "" }}
                onToggleAgent={() => undefined}
            />,
        );

        expect(screen.queryByText("文档")).toBeNull();
        expect(screen.queryByRole("button", { name: "Agent" })).toBeNull();
        expect(screen.queryByText("Agent", { selector: "span" })).toBeNull();
        expect(screen.getByTestId("version-control")).toBeInTheDocument();
    });

    test("keeps canvas-menu documentation and Agent controls in standalone mode", () => {
        render(
            <CanvasTopBar
                title="Demo"
                titleDraft="Demo"
                isTitleEditing={false}
                onTitleDraftChange={() => undefined}
                onStartTitleEditing={() => undefined}
                onFinishTitleEditing={() => undefined}
                onCancelTitleEditing={() => undefined}
                canUndo={false}
                canRedo={false}
                onHome={() => undefined}
                onProjects={() => undefined}
                onCreateProject={() => undefined}
                onDeleteProject={() => undefined}
                onExportProject={() => undefined}
                onImportImage={() => undefined}
                onOpenPlugins={() => undefined}
                onUndo={() => undefined}
                onRedo={() => undefined}
                agentOpen={false}
                compactAgentStatus={{ connected: false, enabled: false, activity: "" }}
                onToggleAgent={() => undefined}
            />,
        );

        expect(screen.getAllByText("文档").length).toBeGreaterThan(0);
        expect(screen.getByRole("button", { name: "Agent" })).toBeInTheDocument();
    });

    test.each([true, false])("mounts the Agent panel only in standalone mode (embedded=%s)", (embedded) => {
        setEmbedded(embedded);
        agentState.panelOpen = true;

        render(
            <UserLayout>
                <div data-testid="layout-child">Canvas</div>
            </UserLayout>,
        );

        if (embedded) expect(screen.queryByTestId("agent-panel")).toBeNull();
        else expect(screen.getByTestId("agent-panel")).toBeInTheDocument();
    });

    test("opens the config dialog when an embedded account has no enabled key", async () => {
        setEmbedded(true);
        useHostTokensStore.setState({ status: "ready", tokens: [], error: "", userId: 42, requestId: "request-1" });

        render(
            <UserLayout>
                <div data-testid="layout-child">Canvas</div>
            </UserLayout>,
        );

        expect(screen.queryByRole("alert")).toBeNull();
        await waitFor(() => expect(openConfigDialog).toHaveBeenCalledWith(false, "channels"));
    });

    test("opens the config dialog instead of the model-check banner while embedded", async () => {
        useHostTokensStore.setState({ status: "ready", tokens: [{ id: 1, name: "canvas", key: "sk-test" }], error: "", userId: 42, requestId: "request-1" });
        useHostBootstrapStore.setState({
            status: "ready",
            error: "",
            modelStatus: "error",
            modelError: "图片模型不可用",
            availableImageModels: [],
            userId: 42,
        });

        setEmbedded(true);
        const { unmount } = render(
            <UserLayout>
                <div data-testid="layout-child">Canvas</div>
            </UserLayout>,
        );
        expect(screen.queryByText("Check the image model configuration")).toBeNull();
        await waitFor(() => expect(openConfigDialog).toHaveBeenCalledWith(false, "channels"));

        unmount();
        openConfigDialog.mockClear();
        setEmbedded(false);
        render(
            <UserLayout>
                <div data-testid="layout-child">Canvas</div>
            </UserLayout>,
        );
        expect(screen.queryByRole("alert")).toBeNull();
        expect(openConfigDialog).not.toHaveBeenCalled();
    });

    test("does not auto-open the config dialog after a channel has a key and models", async () => {
        configState.channels = [{ apiKey: "sk-user", models: [{ name: "gpt-image-1" }, { name: "flux-1" }] }];
        useHostTokensStore.setState({ status: "ready", tokens: [{ id: 1, name: "canvas", key: "sk-user" }], error: "", userId: 42, requestId: "request-1" });
        useHostBootstrapStore.setState({
            status: "ready",
            error: "",
            modelStatus: "error",
            modelError: "图片模型不可用",
            availableImageModels: [],
            userId: 42,
        });
        setEmbedded(true);

        render(
            <UserLayout>
                <div data-testid="layout-child">Canvas</div>
            </UserLayout>,
        );

        expect(screen.queryByText("Check the image model configuration")).toBeNull();
        await waitFor(() => expect(screen.getByTestId("layout-child")).toBeInTheDocument());
        expect(openConfigDialog).not.toHaveBeenCalled();
    });

    test("does not reopen the config dialog after the user closes it", async () => {
        setEmbedded(true);
        useHostTokensStore.setState({ status: "ready", tokens: [], error: "", userId: 42, requestId: "request-1" });

        const view = render(
            <UserLayout>
                <div data-testid="layout-child">Canvas</div>
            </UserLayout>,
        );
        await waitFor(() => expect(openConfigDialog).toHaveBeenCalledWith(false, "channels"));
        openConfigDialog.mockClear();

        configState.isConfigOpen = true;
        view.rerender(
            <UserLayout>
                <div data-testid="layout-child">Canvas</div>
            </UserLayout>,
        );
        configState.isConfigOpen = false;
        view.rerender(
            <UserLayout>
                <div data-testid="layout-child">Canvas</div>
            </UserLayout>,
        );

        await waitFor(() => expect(screen.getByTestId("layout-child")).toBeInTheDocument());
        expect(openConfigDialog).not.toHaveBeenCalled();
    });
});
