import { afterEach, describe, expect, it } from "vitest";

import { CANVAS_LOCALES, CANVAS_MESSAGE_KEYS, canvasText, canvasTextWithParams, getCanvasLocale, normalizeCanvasLocale } from "@/lib/canvas-i18n";

describe("canvas bootstrap translations", () => {
    afterEach(() => {
        localStorage.removeItem("i18nextLng");
        document.documentElement.lang = "";
    });

    it.each([
        ["en-US", "en"],
        ["zh-CN", "zhCN"],
        ["zh-TW", "zhTW"],
        ["zh-Hant", "zhTW"],
        ["fr-FR", "fr"],
        ["ru-RU", "ru"],
        ["ja-JP", "ja"],
        ["vi-VN", "vi"],
    ])("normalizes %s to %s", (input, expected) => {
        expect(normalizeCanvasLocale(input)).toBe(expected);
    });

    it("uses the host-selected locale persisted by the main app", () => {
        localStorage.setItem("i18nextLng", "en");

        expect(getCanvasLocale()).toBe("en");
        expect(canvasText("host.retry", "en")).toBe("Retry");
        expect(canvasText("host.retry", "zhCN")).toBe("重试");
    });

    it("keeps every status and config key translated in every supported locale", () => {
        for (const locale of CANVAS_LOCALES) {
            for (const key of CANVAS_MESSAGE_KEYS) {
                expect(canvasText(key, locale), `${locale}:${key}`).toBeTruthy();
            }
        }
    });

    it("interpolates bounded status values without changing the locale", () => {
        expect(canvasTextWithParams("media.serverError", { status: 503 }, "en")).toContain("HTTP 503");
        expect(canvasTextWithParams("media.serverError", { status: 503 }, "zhCN")).toContain("503");
        expect(canvasTextWithParams("media.missingModel", { media: canvasText("media.image", "en") }, "en")).toContain("image");
    });
});
