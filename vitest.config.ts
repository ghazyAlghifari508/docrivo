import { fileURLToPath } from "node:url";
import { defineConfig } from "vitest/config";

export default defineConfig({
  // `tsconfig.json` maps `@/*` to `./src/*`, which Next.js honours. Vite does
  // not read tsconfig paths, so without this any test that reaches a module
  // using the alias fails on `Cannot find package '@/db'` before it reaches the
  // assertion. `schema.test.ts` imported `./index` relatively and never hit it.
  resolve: {
    alias: {
      "@": fileURLToPath(new URL("./src", import.meta.url)),
    },
  },
  test: {
    environment: "node",
    include: ["src/**/*.test.ts"],
    pool: "forks",
  },
});
