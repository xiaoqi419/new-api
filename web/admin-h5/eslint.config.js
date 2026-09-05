import eslint from "@eslint/js";
import tseslint from "typescript-eslint";

export default tseslint.config(
  {
    ignores: ["dist/**", "node_modules/**"],
  },
  eslint.configs.recommended,
  ...tseslint.configs.recommended,
  {
    files: ["postcss.config.cjs"],
    languageOptions: {
      globals: {
        module: "readonly",
      },
    },
  },
);
