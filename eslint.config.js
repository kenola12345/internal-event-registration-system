import js from "@eslint/js";
import prettier from "eslint-config-prettier";
import reactHooks from "eslint-plugin-react-hooks";
import simpleImportSort from "eslint-plugin-simple-import-sort";
import tseslint from "typescript-eslint";

export default tseslint.config(
  {
    ignores: ["**/dist/**", "**/node_modules/**", "**/coverage/**", "eslint.config.js"],
  },
  js.configs.recommended,
  ...tseslint.configs.strictTypeChecked,
  {
    languageOptions: {
      parserOptions: { projectService: true, tsconfigRootDir: import.meta.dirname },
    },
    plugins: { "simple-import-sort": simpleImportSort },
    rules: {
      "@typescript-eslint/no-explicit-any": "error",
      "@typescript-eslint/no-unused-vars": [
        "error",
        { argsIgnorePattern: "^_", varsIgnorePattern: "^_" },
      ],
      "@typescript-eslint/consistent-type-imports": "error",
      "@typescript-eslint/no-floating-promises": "error",
      "@typescript-eslint/switch-exhaustiveness-check": "error",
      "simple-import-sort/imports": "error",
      "simple-import-sort/exports": "error",
      "no-console": ["error", { allow: ["warn", "error"] }],
      eqeqeq: ["error", "always"],
    },
  },
  {
    // supertest / fetch responses are `any`-typed; asserting on them is the point of a test
    files: ["**/tests/**/*.{ts,tsx}", "**/*.test.{ts,tsx}"],
    rules: {
      "@typescript-eslint/no-unsafe-assignment": "off",
      "@typescript-eslint/no-unsafe-member-access": "off",
      "@typescript-eslint/no-unsafe-argument": "off",
      "@typescript-eslint/no-unsafe-call": "off",
    },
  },
  {
    files: ["frontend/**/*.{ts,tsx}"],
    plugins: { "react-hooks": reactHooks },
    rules: reactHooks.configs.recommended.rules,
  },

  // ---------------------------------------------------------------------------
  // Frontend architecture boundaries (see docs/ARCHITECTURE.md)
  // Code flows one way: shared (components, hooks, lib, utils) -> features -> app.
  // Inside a feature, use RELATIVE imports; the "@/features/*" alias is reserved for `app/`.
  // ---------------------------------------------------------------------------
  {
    files: ["frontend/src/features/**/*.{ts,tsx}"],
    rules: {
      "no-restricted-imports": [
        "error",
        {
          patterns: [
            {
              group: ["@/features/*", "@/app/*"],
              message:
                "Features must not import other features or the app layer. Compose features in src/app/ instead.",
            },
          ],
        },
      ],
    },
  },
  {
    files: [
      "frontend/src/components/**/*.{ts,tsx}",
      "frontend/src/hooks/**/*.{ts,tsx}",
      "frontend/src/lib/**/*.{ts,tsx}",
      "frontend/src/utils/**/*.{ts,tsx}",
      "frontend/src/config/**/*.{ts,tsx}",
    ],
    rules: {
      "no-restricted-imports": [
        "error",
        {
          patterns: [
            {
              group: ["@/features/*", "@/app/*"],
              message: "Shared code must not depend on features or the app layer.",
            },
          ],
        },
      ],
    },
  },
  prettier,
);
