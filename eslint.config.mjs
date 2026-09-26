import tsparser from "@typescript-eslint/parser";
import { defineConfig } from "eslint/config";
import obsidianmd from "eslint-plugin-obsidianmd";
import tseslint from "typescript-eslint";
import globals from "globals";

export default defineConfig([
  { ignores: ["**/dist/**", "main.js", "test/**", "*.mjs", "node_modules/**"] },
  ...tseslint.configs.recommendedTypeChecked,
  ...(obsidianmd.configs?.recommendedWithLocalesEn || []),
  {
    files: ["src/**/*.ts"],
    languageOptions: {
      globals: { ...globals.browser },
      parser: tsparser,
      parserOptions: { projectService: true, tsconfigRootDir: import.meta.dirname },
    },
    rules: { "@typescript-eslint/no-deprecated": "warn" },
  },
]);
