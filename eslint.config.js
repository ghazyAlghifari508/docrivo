import js from "@eslint/js"
import { defineConfig, globalIgnores } from "eslint/config"
import tseslint from "typescript-eslint"

/**
 * The only ESLint config in this repository.
 *
 * Task 3.1 deleted `eslint.config.mjs` in the same commit that added this file:
 * ESLint 9 flat config loads *every* `eslint.config.*` it finds, so two files
 * means every rule is applied twice and the two can silently disagree. If you
 * add a second config, delete this one.
 *
 * The rule set exists because Task 3.1 removed `eslint-config-next`, which was
 * the only thing supplying a TypeScript-aware parser. Without a replacement the
 * config had zero rules and `npx eslint <dir>` reported every file as ignored
 * while exiting 2 -- a lint script that cannot fail is worse than no lint
 * script, because it reads as a passing gate. `typescript-eslint` (pinned
 * 8.46.4) restores the parser, and the rules below are the ones that have caught
 * real defects in this codebase: unused bindings, floating promises, and the
 * `~/*` alias resolving to nothing.
 */
export default defineConfig([
  globalIgnores([
    "dist/**",
    ".output/**",
    ".nitro/**",
    ".tanstack/**",
    ".vinxi/**",
    "build/**",
    "coverage/**",
    "drizzle/**",
    "var/**",
    "backup/**",
    "graphify-out/**",
    "public/**",
    "next-env.d.ts",
    "src/routeTree.gen.ts",
  ]),

  {
    files: ["**/*.{ts,tsx}"],
    extends: [
      js.configs.recommended,
      ...tseslint.configs.recommended,
    ],
    languageOptions: {
      // `no-floating-promises` and `no-misused-promises` are type-aware rules:
      // without this ESLint refuses to load them and exits 2. `projectService`
      // resolves the nearest tsconfig per file, so the `~/*` path mapping and
      // `include` list come from the real config rather than a second copy here.
      parserOptions: {
        projectService: true,
        tsconfigRootDir: import.meta.dirname,
      },
    },
    rules: {
      // The router tree and the generated route manifest are machine-written.
      "@typescript-eslint/no-unused-vars": [
        "error",
        { argsIgnorePattern: "^_", varsIgnorePattern: "^_" },
      ],
      // A server function that forgets `await` returns a pending promise to the
      // client as if it were data. This is the single most dangerous class of
      // bug in a TanStack Start codebase and nothing else here catches it.
      "@typescript-eslint/no-floating-promises": "error",
      "@typescript-eslint/no-misused-promises": [
        "error",
        { checksVoidReturn: { attributes: false } },
      ],
      // The project is ESM with a `~/*` alias; a stray CommonJS `require` or a
      // bare `import x = require()` silently bypasses the bundler.
      "@typescript-eslint/no-require-imports": "error",
    },
  },

  {
    // Config files and scripts run in Node, not the browser.
    files: ["*.config.ts", "scripts/**/*.{ts,js,mjs}"],
    rules: {
      "@typescript-eslint/no-explicit-any": "off",
    },
  },
])
