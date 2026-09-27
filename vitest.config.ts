import { fileURLToPath } from "node:url";
import { defineConfig } from "vitest/config";

export default defineConfig({
  // `tsconfig.json` maps `~/*` to `./src/*`. Vite does not read tsconfig paths,
  // so without this any test that reaches a module using the alias fails on
  // `Cannot find package '~/db'` before it reaches the assertion.
  // `src/auth/middleware.test.ts` is the test that exercises it: it imports
  // `./middleware`, which reaches `./server`, which imports `~/db`.
  resolve: {
    alias: {
      "~": fileURLToPath(new URL("./src", import.meta.url)),
    },
  },
  test: {
    environment: "node",
    include: ["src/**/*.test.ts"],
    pool: "forks",
  },
});
