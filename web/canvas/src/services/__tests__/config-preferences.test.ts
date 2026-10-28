import { afterEach, expect, test } from "vitest";

import { normalizeImportedConfig } from "@/services/config-file";
import { CONFIG_STORE_KEY, defaultConfig, useConfigStore } from "@/stores/use-config-store";

const initialConfig = useConfigStore.getState().config;

afterEach(() => {
    localStorage.removeItem(CONFIG_STORE_KEY);
    useConfigStore.setState({ config: initialConfig });
});

test("new preferences survive import and a persisted reload alongside old image settings", async () => {
    const source = { ...defaultConfig, nodeRegenerateBehavior: "overwrite", autoFocusOnSelect: true, size: "2048x2048", quality: "high", vquality: "1080" };
    const imported = normalizeImportedConfig(source);
    expect(imported).toMatchObject({ nodeRegenerateBehavior: "overwrite", autoFocusOnSelect: true, size: "2048x2048", quality: "high", vquality: "1080" });
    localStorage.setItem(CONFIG_STORE_KEY, JSON.stringify({ state: { config: imported }, version: 0 }));
    await useConfigStore.persist.rehydrate();
    expect(useConfigStore.getState().config).toMatchObject({ nodeRegenerateBehavior: "overwrite", autoFocusOnSelect: true, size: "2048x2048", quality: "high", vquality: "1080" });
});

test("old and malformed preferences keep the original new-node behavior without automatic centering", () => {
    for (const source of [{}, { nodeRegenerateBehavior: "unknown", autoFocusOnSelect: "false" }]) {
        expect(normalizeImportedConfig(source)).toMatchObject({ nodeRegenerateBehavior: "new-node", autoFocusOnSelect: false });
    }
});
