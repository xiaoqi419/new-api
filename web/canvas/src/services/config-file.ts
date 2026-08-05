import { saveAs } from "file-saver";

import { lockedApiBaseUrl } from "@/lib/host-bridge";
import { useConfigStore, type AiConfig, type WebdavSyncConfig } from "@/stores/use-config-store";
import { usePromptSourceStore, type PromptSourceSchedule } from "@/stores/use-prompt-source-store";
import type { PromptSource } from "@/services/api/prompt-source-presets";

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
    const data: AppConfigFile = { app: "infinite-canvas", version: 1, exportedAt: new Date().toISOString(), config, webdav, promptSources: { sources, schedule } };
    saveAs(new Blob([JSON.stringify(data, null, 2)], { type: "application/json;charset=utf-8" }), "infinite-canvas-config.json");
}

export async function importAppConfig(file: File) {
    let data: AppConfigFile;
    try {
        data = JSON.parse(await file.text()) as AppConfigFile;
    } catch {
        throw new Error("配置文件格式不正确");
    }
    if (data.app !== "infinite-canvas" || data.version !== 1 || !data.config || !data.webdav || !data.promptSources) throw new Error("配置文件格式不正确");
    // 导入是直接覆盖 store 的，绕开了读取时的归一化，内嵌时在这里补上地址锁定，
    // 否则导入一份别处导出的配置就能把接口地址换掉，而界面上仍显示已锁定。
    const locked = lockedApiBaseUrl();
    const config = locked ? { ...data.config, baseUrl: locked, channels: (data.config.channels ?? []).map((channel) => ({ ...channel, baseUrl: locked })) } : data.config;
    useConfigStore.setState({ config, webdav: data.webdav });
    usePromptSourceStore.setState(data.promptSources);
}
