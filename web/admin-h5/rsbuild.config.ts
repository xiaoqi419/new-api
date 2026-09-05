import { defineConfig } from "@rsbuild/core";
import { pluginReact } from "@rsbuild/plugin-react";

export default defineConfig({
  plugins: [pluginReact()],
  html: {
    title: "Admin H5",
  },
  output: {
    assetPrefix: "/admin-h5/",
  },
  server: {
    base: "/admin-h5/",
  },
  source: {
    entry: {
      index: "./src/main.tsx",
    },
    define: {
      "import.meta.env.VITE_API_BASE_URL": JSON.stringify(process.env.VITE_API_BASE_URL ?? ""),
    },
  },
});
