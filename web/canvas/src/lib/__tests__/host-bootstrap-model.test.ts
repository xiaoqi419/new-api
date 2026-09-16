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
import { afterEach, beforeEach, describe, expect, test, vi } from "vitest";

import { applyModelCatalog, clearUnavailableImageConfig, reconcileHostConfig, retryHostBootstrap, startHostBootstrap, stopHostBootstrap, useHostBootstrapStore } from "@/lib/host-bootstrap";
import { HOST_TOKENS_REQUEST_MESSAGE, resetHostTokens, useHostTokensStore } from "@/lib/host-bridge";
import { defaultConfig, encodeChannelModel, useConfigStore, type AiConfig, type ModelChannel } from "@/stores/use-config-store";
import type { AvailableModel } from "@/services/api/image";

function channel(id: string, modelName: string, capability: "image" | "text"): ModelChannel {
    return {
        id,
        name: id,
        baseUrl: "https://relay.example",
        apiKey: `sk-${id}`,
        apiFormat: "openai",
        models: [{ name: modelName, capability }],
    };
}

function catalog(name: string, capability: "image" | "text" = "image", capabilitySource: AvailableModel["capabilitySource"] = "metadata"): AvailableModel {
    return { name, capability, supportsImage: capability === "image", capabilitySource };
}

function config(channels: ModelChannel[], overrides: Partial<AiConfig> = {}): AiConfig {
    return {
        ...defaultConfig,
        channels,
        models: channels.flatMap((item) => item.models.map((model) => encodeChannelModel(item.id, model.name))),
        model: "",
        imageModel: "",
        ...overrides,
    };
}

describe("host model catalog application", () => {
    test("does not mutate the first channel when the requested channel id is stale", () => {
        const value = config([channel("first", "gpt-5.5", "text"), channel("second", "gpt-image-1", "image")], {
            apiKey: "sk-second",
            imageModel: "second::gpt-image-1",
        });

        const result = applyModelCatalog(value, [catalog("new-image")], "missing-channel");

        expect(result).toBe(value);
        expect(result.channels[0]?.models).toEqual([{ name: "gpt-5.5", capability: "text" }]);
        expect(result.channels[1]?.models).toEqual([{ name: "gpt-image-1", capability: "image" }]);
    });

    test("applies a catalog only to the explicitly selected channel", () => {
        const value = config([channel("first", "gpt-5.5", "text"), channel("second", "old-image", "image")], {
            apiKey: "sk-second",
            imageModel: "second::old-image",
        });

        const result = applyModelCatalog(value, [catalog("new-image")], "second");

        expect(result.channels[0]?.models).toEqual([{ name: "gpt-5.5", capability: "text" }]);
        expect(result.channels[1]?.models).toEqual([expect.objectContaining({ name: "new-image", capability: "image" })]);
        expect(result.imageModel).toBe("second::new-image");
        expect((result.channels[1]?.models[0] as { verified?: boolean }).verified).toBe(true);
    });

    test("does not advertise an image model when a heuristic result conflicts with an explicit text override", () => {
        const value = config([channel("images", "ambiguous-model", "text")], {
            apiKey: "sk-images",
            imageModel: "images::ambiguous-model",
        });

        const result = applyModelCatalog(value, [catalog("ambiguous-model", "image", "heuristic")], "images");

        expect(result.channels[0]?.models[0]).toMatchObject({ name: "ambiguous-model", capability: "text", verified: false });
        expect(result.imageModel).toBe("");
    });
});

describe("embedded host bootstrap recovery", () => {
    let parentSource: Window;
    let postedMessages: Array<{ data: unknown; targetOrigin: string }>;

    beforeEach(() => {
        postedMessages = [];
        parentSource = {
            postMessage(data: unknown, targetOrigin: string) {
                postedMessages.push({ data, targetOrigin });
            },
        } as unknown as Window;
        Object.defineProperty(window, "parent", { configurable: true, value: parentSource });
        resetHostTokens();
        stopHostBootstrap();
    });

    afterEach(() => {
        vi.useRealTimers();
        stopHostBootstrap();
        resetHostTokens();
        localStorage.removeItem("i18nextLng");
        vi.unstubAllGlobals();
    });

    test("forces a fresh host token request when retrying a ready response", () => {
        useHostTokensStore.setState({ status: "ready", tokens: [{ id: 1, key: "sk-account", name: "Account" }], error: "", userId: 7, requestId: "old-request" });

        retryHostBootstrap();

        const request = postedMessages.find((message) => (message.data as { type?: unknown }).type === HOST_TOKENS_REQUEST_MESSAGE);
        expect(request).toBeDefined();
        expect((request?.data as { force?: unknown }).force).toBe(true);
        expect((request?.data as { requestId?: unknown }).requestId).not.toBe("old-request");
        expect(useHostTokensStore.getState()).toMatchObject({ status: "loading", tokens: [], userId: 7 });
    });

    test("fails closed immediately for an opaque embedded origin", () => {
        localStorage.setItem("i18nextLng", "zh-CN");
        vi.stubGlobal("window", { parent: {}, location: { origin: "null" } } as unknown as Window & typeof globalThis);

        startHostBootstrap();

        expect(useHostBootstrapStore.getState()).toMatchObject({ status: "error", modelStatus: "idle" });
        expect(useHostBootstrapStore.getState().error).toContain("来源不可验证");
        expect(useHostTokensStore.getState()).toMatchObject({ status: "error", tokens: [], requestId: "" });
    });

    test("marks a lost recovery request as an explicit error when the origin becomes opaque", async () => {
        localStorage.setItem("i18nextLng", "zh-CN");
        vi.useFakeTimers();
        startHostBootstrap();
        expect(useHostTokensStore.getState().status).toBe("loading");
        vi.stubGlobal("window", { parent: {}, location: { origin: "null" } } as unknown as Window & typeof globalThis);

        await vi.advanceTimersByTimeAsync(1500);

        expect(useHostTokensStore.getState()).toMatchObject({ status: "error", tokens: [] });
        expect(useHostTokensStore.getState().error).toContain("请求通道不可用");
        await Promise.resolve();
        expect(useHostBootstrapStore.getState()).toMatchObject({ status: "error", modelStatus: "idle" });
    });

    test("uses the selected locale for a token request timeout", async () => {
        localStorage.setItem("i18nextLng", "en");
        vi.useFakeTimers();

        startHostBootstrap();
        await vi.advanceTimersByTimeAsync(4500);

        expect(useHostTokensStore.getState()).toMatchObject({
            status: "error",
            error: "The host API key request timed out. Please try again.",
        });
    });

    test("uses the selected locale when an embedded origin cannot be verified", () => {
        localStorage.setItem("i18nextLng", "en");
        vi.stubGlobal("window", { parent: {}, location: { origin: "null" } } as unknown as Window & typeof globalThis);

        startHostBootstrap();

        expect(useHostBootstrapStore.getState().error).toBe("The embedded Canvas origin could not be verified. Reopen it from the main site and try again.");
    });

    test("does not retain provider URLs or keys for an opaque embedded config", () => {
        const originalWindow = globalThis.window;
        vi.stubGlobal("window", { parent: {}, location: { origin: "null" } } as unknown as Window & typeof globalThis);
        const value = config([channel("external", "gpt-image-1", "image")], { baseUrl: "https://provider.invalid", apiKey: "sk-stale", imageModel: "external::gpt-image-1", model: "external::gpt-image-1" });

        const cleared = clearUnavailableImageConfig(value);
        expect(cleared).toMatchObject({ baseUrl: "", apiKey: "", imageModel: "", model: "" });
        expect(cleared.channels[0]).toMatchObject({ baseUrl: "", apiKey: "" });

        const reconciled = reconcileHostConfig(value, [{ id: 1, key: "sk-authorized", name: "Current" }]);
        expect(reconciled.selectedKey).toBe("");
        expect(reconciled.config).toMatchObject({ baseUrl: "", apiKey: "" });
        expect(reconciled.config.channels[0]).toMatchObject({ baseUrl: "", apiKey: "" });
        vi.stubGlobal("window", originalWindow);
    });

    test("keeps user-saved verified image models when catalog scrub runs", () => {
        Object.defineProperty(window, "parent", { configurable: true, value: parentSource });
        const saved = config(
            [
                {
                    id: "default",
                    name: "默认渠道",
                    baseUrl: window.location.origin,
                    apiKey: "sk-user",
                    apiFormat: "openai",
                    models: [{ name: "gpt-image-1", capability: "image", verified: true, verifiedKey: "sk-user" }],
                },
            ],
            { apiKey: "sk-user", imageModel: "default::gpt-image-1" },
        );

        const next = clearUnavailableImageConfig(saved);

        expect(next.channels[0]?.models).toEqual([expect.objectContaining({ name: "gpt-image-1", verified: true, verifiedKey: "sk-user" })]);
        expect(next.imageModel).toBe("default::gpt-image-1");
    });

    test("still drops unverified image models during catalog scrub", () => {
        Object.defineProperty(window, "parent", { configurable: true, value: parentSource });
        const saved = config(
            [
                {
                    id: "default",
                    name: "默认渠道",
                    baseUrl: window.location.origin,
                    apiKey: "sk-user",
                    apiFormat: "openai",
                    models: [{ name: "stale-image", capability: "image" }],
                },
            ],
            { apiKey: "sk-user", imageModel: "default::stale-image" },
        );

        const next = clearUnavailableImageConfig(saved);

        expect(next.channels[0]?.models).toEqual([]);
        expect(next.imageModel).toBe("");
    });

    test("scrubs old credentials and verified image models while a new host request is loading", () => {
        const oldConfig = config([channel("account", "gpt-image-1", "image"), channel("text", "gpt-5.5", "text")], {
            baseUrl: window.location.origin,
            apiKey: "sk-old-account",
            model: "account::gpt-image-1",
            imageModel: "account::gpt-image-1",
        });
        useConfigStore.setState({ config: oldConfig });
        startHostBootstrap();

        useHostTokensStore.setState({ status: "loading", tokens: [{ id: 1, key: "sk-old-account", name: "Old account" }], error: "", userId: 22, requestId: "account-switch" });

        const next = useConfigStore.getState().config;
        expect(next.apiKey).toBe("");
        expect(next.imageModel).toBe("");
        expect(next.model).toBe("");
        expect(next.channels.find((item) => item.id === "account")).toMatchObject({ apiKey: "", models: [] });
        expect(next.channels.find((item) => item.id === "text")).toMatchObject({ apiKey: "", models: [{ name: "gpt-5.5", capability: "text" }] });
        expect(useHostTokensStore.getState().tokens).toEqual([]);
        expect(useHostBootstrapStore.getState()).toMatchObject({ status: "loading", userId: 22, availableImageModels: [] });
    });
});
