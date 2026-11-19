// @ts-check
import js from "@eslint/js";
import globals from "globals";
import tseslint from "typescript-eslint";

const nodeBuiltins = [
  "node:*",
  "fs",
  "path",
  "crypto",
  "os",
  "child_process",
  "http",
  "https",
  "net",
  "stream",
  "util",
  "worker_threads",
];

export default tseslint.config(
  {
    ignores: [
      "**/dist/**",
      "**/.next/**",
      "**/node_modules/**",
      "**/coverage/**",
      "**/playwright-report/**",
      "**/test-results/**",
      "**/generated/**",
      "**/next-env.d.ts",
    ],
  },
  js.configs.recommended,
  ...tseslint.configs.strict,
  {
    languageOptions: {
      globals: { ...globals.node },
    },
    rules: {
      // `any` needs a disable comment that says why.
      "@typescript-eslint/no-explicit-any": "error",
      "@typescript-eslint/no-unused-vars": [
        "error",
        { argsIgnorePattern: "^_", varsIgnorePattern: "^_" },
      ],
      "no-restricted-imports": [
        "error",
        {
          paths: [
            {
              name: "framer-motion",
              message: "Use Tailwind transitions or tw-animate-css instead.",
            },
            { name: "motion", message: "Use Tailwind transitions or tw-animate-css instead." },
          ],
          patterns: [
            {
              group: ["motion/*", "framer-motion/*"],
              message: "Use Tailwind transitions or tw-animate-css instead.",
            },
            {
              group: ["@careloop/db/src/*", "@careloop/db/dist/*"],
              message:
                "Import from the @careloop/db entry point so tenant helpers can't be bypassed.",
            },
          ],
        },
      ],
    },
  },
  {
    // Apps log through the structured logger, never console.log.
    files: ["apps/**/*.{ts,tsx}"],
    ignores: ["apps/**/*.test.{ts,tsx}", "apps/**/e2e/**"],
    rules: {
      "no-console": ["error", { allow: ["warn", "error"] }],
    },
  },
  {
    // The web app never touches the database package directly.
    files: ["apps/web/**/*.{ts,tsx}"],
    rules: {
      "no-restricted-imports": [
        "error",
        {
          paths: [
            { name: "@careloop/db", message: "The web app talks to the API, never the database." },
            {
              name: "framer-motion",
              message: "Use Tailwind transitions or tw-animate-css instead.",
            },
            { name: "motion", message: "Use Tailwind transitions or tw-animate-css instead." },
          ],
          patterns: [
            {
              group: ["@careloop/db/*"],
              message: "The web app talks to the API, never the database.",
            },
            {
              group: ["motion/*", "framer-motion/*"],
              message: "Use Tailwind transitions or tw-animate-css instead.",
            },
          ],
        },
      ],
    },
  },
  {
    // shared is imported by browser code, so it stays free of Node-only APIs.
    files: ["packages/shared/src/**/*.ts"],
    rules: {
      "no-restricted-imports": [
        "error",
        {
          paths: nodeBuiltins
            .filter((name) => !name.includes("*"))
            .map((name) => ({
              name,
              message: "packages/shared must run in the browser too.",
            })),
          patterns: [
            { group: ["node:*"], message: "packages/shared must run in the browser too." },
          ],
        },
      ],
    },
  },
  {
    // User-facing text goes through i18n keys, never literal JSX text.
    files: ["apps/web/**/*.tsx", "packages/ui/src/**/*.tsx"],
    ignores: ["**/*.test.tsx", "**/test/**"],
    languageOptions: {
      globals: { ...globals.browser },
    },
    rules: {
      "no-restricted-syntax": [
        "error",
        {
          selector: "JSXText[value=/[A-Za-z\\u0900-\\u097F]/]",
          message: "Put user-facing text in an i18n message, not literal JSX text.",
        },
      ],
    },
  },
);
