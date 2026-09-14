import { dirname, resolve } from "node:path";
import { fileURLToPath } from "node:url";

import { defineConfig } from "vitest/config";

const webDir = dirname(fileURLToPath(import.meta.url));

export default defineConfig({
    resolve: {
        alias: {
            "@": resolve(webDir, "src"),
        },
        // The parent web workspace currently provides Vitest and testing
        // utilities, while Canvas keeps its own React copy. Force the test
        // graph to use one React/ReactDOM pair so hooks are not split across
        // package boundaries.
        dedupe: ["react", "react-dom"],
    },
    test: {
        environment: "jsdom",
        setupFiles: ["./src/test-setup.ts"],
        clearMocks: true,
        restoreMocks: true,
        include: ["src/**/*.{test,spec}.{ts,tsx}"],
    },
});
