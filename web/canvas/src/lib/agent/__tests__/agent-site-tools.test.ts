/*
Copyright (C) 2026 QuantumNous

This program is free software: you can redistribute it and/or modify
it under the terms of the GNU Affero General Public License as published by
the Free Software Foundation, either version 3 of the License, or
(at your option) any later version.

This program is distributed in the hope that it will be useful,
but WITHOUT ANY WARRANTY; without even the implied warranty of
MERCHANTABILITY or FITNESS FOR A PARTICULAR PURPOSE. See the
GNU Affero General Public License for more details.

You should have received a copy of the GNU Affero General Public License
along with this program. If not, see <https://www.gnu.org/licenses/>.
*/
import { afterEach, describe, expect, test, vi } from "vitest";
import type { NavigateFunction } from "react-router-dom";

import { runSiteTool, VIDEO_WORKBENCH_UNAVAILABLE } from "../agent-site-tools";

afterEach(() => {
    vi.restoreAllMocks();
});

describe("video workbench agent boundary", () => {
    test("returns the current video configuration without network access", async () => {
        const navigate = vi.fn();
        const fetchSpy = vi.spyOn(globalThis, "fetch");

        const result = await runSiteTool("workbench_video_get_config", {}, navigate as unknown as NavigateFunction);

        expect(result).toMatchObject({
            current: { model: expect.any(String), size: expect.any(String), seconds: expect.any(String), resolution: expect.any(String) },
            models: expect.any(Array),
            sizeOptions: expect.any(Array),
            secondsRange: { min: expect.any(Number), max: expect.any(Number) },
            resolutionOptions: expect.any(Array),
            modeOptions: expect.any(Array),
        });
        expect(navigate).not.toHaveBeenCalled();
        expect(fetchSpy).not.toHaveBeenCalled();
    });

    test("clamps video options, dispatches the command, and navigates to the workbench", async () => {
        const navigate = vi.fn();
        const configModule = await import("@/stores/use-config-store");
        const workbenchModule = await import("@/stores/use-workbench-agent-store");
        const updateConfig = vi.spyOn(configModule.useConfigStore.getState(), "updateConfig");
        const dispatchVideo = vi.spyOn(workbenchModule.useWorkbenchAgentStore.getState(), "dispatchVideo");

        const result = await runSiteTool(
            "workbench_video_generate",
            {
                model: "video-model",
                size: "1280x720",
                seconds: "10",
                resolution: "1080",
                generateAudio: true,
                watermark: false,
                prompt: "a prompt",
                run: true,
            },
            navigate as unknown as NavigateFunction,
        );

        expect(result).toMatchObject({ ok: true, navigated: "/video", prompt: "a prompt", run: true, applied: { seconds: "10", resolution: "1080", watermark: false, generateAudio: true } });
        expect(updateConfig).toHaveBeenCalledWith("videoSeconds", "10");
        expect(updateConfig).toHaveBeenCalledWith("vquality", "1080");
        expect(dispatchVideo).toHaveBeenCalledWith({ prompt: "a prompt", run: true });
        expect(navigate).toHaveBeenCalledWith("/video");

        dispatchVideo.mockRestore();
        updateConfig.mockRestore();
    });

    test("keeps the video workbench unavailable when Canvas is embedded", async () => {
        Object.defineProperty(window, "parent", { configurable: true, value: {} as Window });
        const navigate = vi.fn();
        const configModule = await import("@/stores/use-config-store");
        const workbenchModule = await import("@/stores/use-workbench-agent-store");
        const updateConfig = vi.spyOn(configModule.useConfigStore.getState(), "updateConfig");
        const dispatchVideo = vi.spyOn(workbenchModule.useWorkbenchAgentStore.getState(), "dispatchVideo");

        await expect(runSiteTool("workbench_video_get_config", {}, navigate as unknown as NavigateFunction)).resolves.toEqual({
            ...VIDEO_WORKBENCH_UNAVAILABLE,
            operation: "get_config",
            applied: {},
        });
        await expect(runSiteTool("workbench_video_generate", { prompt: "must stay local", model: "forged", run: true }, navigate as unknown as NavigateFunction)).resolves.toEqual({
            ...VIDEO_WORKBENCH_UNAVAILABLE,
            operation: "generate",
            prompt: "must stay local",
            applied: {},
        });

        expect(updateConfig).not.toHaveBeenCalled();
        expect(dispatchVideo).not.toHaveBeenCalled();
        expect(navigate).not.toHaveBeenCalled();
        updateConfig.mockRestore();
        dispatchVideo.mockRestore();
    });

    test("keeps reporting historical video nodes through generation status", async () => {
        const result = await runSiteTool("generation_get_status", { scope: "all", nodeIds: ["video-node-1"] }, vi.fn() as unknown as NavigateFunction, {
            canvasSnapshot: {
                projectId: "project-1",
                title: "Historical project",
                nodes: [
                    {
                        id: "video-node-1",
                        type: "video",
                        title: "旧视频节点",
                        position: { x: 0, y: 0 },
                        width: 320,
                        height: 180,
                        metadata: { generationMode: "video", status: "success", prompt: "historical video" },
                    },
                ],
                connections: [],
                selectedNodeIds: [],
                viewport: { x: 0, y: 0, k: 1 },
            },
        });

        expect(result).toMatchObject({ total: 1, tasks: [{ id: "video-node-1", source: "canvas", status: "succeeded", kind: "video" }] });
    });
});
