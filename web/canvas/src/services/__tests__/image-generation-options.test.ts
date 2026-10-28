import axios from "axios";
import { afterEach, expect, test, vi } from "vitest";

import { requestEdit, requestGeneration } from "@/services/api/image";
import { getPluginTemplates } from "@/services/api/model-plugin";
import { defaultConfig, type AiConfig } from "@/stores/use-config-store";

function config(overrides: Partial<AiConfig> = {}): AiConfig {
    return {
        ...defaultConfig,
        model: "images::alias-image",
        imageModel: "images::alias-image",
        size: "2048x2048",
        count: "1",
        channels: [{ id: "images", name: "Images", baseUrl: "https://relay.example", apiKey: "local-fixture", apiFormat: "openai", models: [{ name: "alias-image", capability: "image" }] }],
        ...overrides,
    };
}

afterEach(() => vi.restoreAllMocks());

test("image quality changes do not change requested dimensions", async () => {
    const post = vi.spyOn(axios, "post").mockResolvedValue({ data: { data: [{ b64_json: "aW1hZ2U=" }] } });
    for (const quality of ["low", "high", "xhigh", "max"]) {
        await requestGeneration(config({ quality }), "Draw a tree");
        expect(post.mock.calls.at(-1)?.[1]).toMatchObject({ model: "alias-image", size: "2048x2048", quality, n: 1 });
    }
});

test("image edit keeps max quality and all reference images", async () => {
    const post = vi.spyOn(axios, "post").mockResolvedValue({ data: { data: [{ b64_json: "aW1hZ2U=" }] } });
    await requestEdit(config({ quality: "max" }), "Combine the references", [
        { id: "first", name: "first.png", type: "image/png", dataUrl: "data:image/png;base64,YQ==" },
        { id: "second", name: "second.png", type: "image/png", dataUrl: "data:image/png;base64,Yg==" },
    ]);
    const body = post.mock.calls[0][1] as FormData;
    expect(body.get("quality")).toBe("max");
    expect(body.get("size")).toBe("2048x2048");
    expect(body.getAll("image[]")).toHaveLength(2);
});

test("Gemini aliases receive resolution independently of quality and model spelling", async () => {
    const post = vi.spyOn(axios, "post").mockResolvedValue({ data: { candidates: [{ content: { parts: [{ inlineData: { mimeType: "image/png", data: "aW1hZ2U=" } }] } }] } });
    const input = config();
    input.channels[0] = { ...input.channels[0], apiFormat: "gemini" };
    await requestGeneration({ ...input, quality: "max", size: "2048x2048" }, "Draw a tree");
    expect(post.mock.calls[0][1]).toMatchObject({ generationConfig: { imageConfig: { aspectRatio: "1:1", imageSize: "2K" } } });
    expect((post.mock.calls[0][1] as Record<string, unknown>).quality).toBeUndefined();
});

test("custom image scripts receive the selected resolution and quality separately", async () => {
    const input = config({ quality: "xhigh", size: "2880x2880" });
    input.channels[0].models[0] = {
        ...input.channels[0].models[0],
        script: 'if (params.resolution !== "4k" || params.quality !== "xhigh" || params.size !== "2880x2880") throw new Error("Wrong image options"); return ["data:image/png;base64,aW1hZ2U="];',
    };
    const images = await requestGeneration(input, "Draw a tree");
    expect(images).toEqual([expect.objectContaining({ dataUrl: "data:image/png;base64,aW1hZ2U=" })]);
});

test.each([
    { size: "1360x2048", ratio: "2:3", resolution: "2K" },
    { size: "3312x2480", ratio: "4:3", resolution: "4K" },
])("Gemini template maps rounded $size presets to supported aspect ratios", async ({ size, ratio, resolution }) => {
    const request = vi.spyOn(axios, "request").mockResolvedValue({ data: { candidates: [{ content: { parts: [{ inlineData: { mimeType: "image/png", data: "aW1hZ2U=" } }] } }] } });
    const input = config({ size });
    input.channels[0].models[0] = { ...input.channels[0].models[0], script: getPluginTemplates().image[1].script };
    await requestGeneration(input, "Draw a tree");
    expect(request.mock.calls[0][0].data).toMatchObject({ generationConfig: { imageConfig: { aspectRatio: ratio, imageSize: resolution } } });
});
