import js from "@eslint/js";
import globals from "globals";
import tseslint from "typescript-eslint";
import importX from "eslint-plugin-import-x";
import vitest from "@vitest/eslint-plugin";
import reactHooks from "eslint-plugin-react-hooks";
import reactRefresh from "eslint-plugin-react-refresh";
import jsxA11y from "eslint-plugin-jsx-a11y";
import prettier from "eslint-config-prettier";

const restrictedImports = [
  {
    group: ["shadcn", "@repo/shadcn-ui"],
    message: "shadcn registry packages must not ship with the widget.",
  },
];

export default tseslint.config(
  {
    ignores: [
      "**/dist/**",
      "**/coverage/**",
      "node_modules/**",
      ".omx/**",
      ".playwright-mcp/**",
      "playwright.config.js",
      "vitest.config.js",
    ],
  },
  js.configs.recommended,
  ...tseslint.configs.recommendedTypeChecked,
  {
    languageOptions: {
      parserOptions: {
        projectService: {
          allowDefaultProject: [
            "test-harness/widget-harness/e2e/*.ts",
            "test-harness/widget-harness/vite.config.ts",
          ],
        },
        tsconfigRootDir: import.meta.dirname,
      },
      globals: { ...globals.node, ...globals.browser },
    },
    plugins: {
      "import-x": importX,
      vitest,
      "react-hooks": reactHooks,
      "react-refresh": reactRefresh,
      "jsx-a11y": jsxA11y,
    },
    rules: {
      "@typescript-eslint/consistent-type-imports": [
        "error",
        { prefer: "type-imports" },
      ],
      "@typescript-eslint/no-explicit-any": "error",
      "@typescript-eslint/no-floating-promises": "error",
      "@typescript-eslint/no-misused-promises": "error",
      "@typescript-eslint/switch-exhaustiveness-check": "error",
      "no-restricted-imports": ["error", { patterns: restrictedImports }],
      "no-nested-ternary": "error",
      complexity: ["error", 12],
      "max-depth": ["error", 4],
      "max-params": ["warn", 6],
      "no-debugger": "error",
      "no-alert": "error",
      "no-duplicate-imports": "error",
      "import-x/no-cycle": "error",
      "react-hooks/rules-of-hooks": "error",
      "react-hooks/exhaustive-deps": "warn",
      "react-refresh/only-export-components": "off",
      "vitest/no-focused-tests": "error",
      "vitest/no-disabled-tests": "error",
    },
  },
  {
    files: ["**/*.test.ts", "**/*.type.test.ts", "vitest.config.ts"],
    extends: [tseslint.configs.disableTypeChecked],
    rules: { "@typescript-eslint/no-non-null-assertion": "off" },
  },
  {
    files: ["eslint.config.js", "scripts/**/*.mjs"],
    extends: [tseslint.configs.disableTypeChecked],
  },
  {
    files: ["playwright.config.ts", "**/vite.config.ts"],
    rules: { "import-x/no-cycle": "off" },
  },
  prettier,
);
