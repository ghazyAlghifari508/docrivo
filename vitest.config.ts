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
    // `worker` is here as of Task 6.1, which ported the background worker off the
    // InsForge client and onto Drizzle. `tsconfig.json` already includes that
    // directory, so the coverage gap was only in this glob -- and an uncollected
    // test file is worse than no test, because `npm test` reports green.
    include: ["src/**/*.test.ts", "worker/**/*.test.ts"],
    pool: "forks",
    // Sequential, because every database-backed suite in this project shares one
    // `docrivo_test`. `src/queries/jobs.test.ts` truncates `generation_jobs` so
    // its claim tests start from an empty queue, and that delete is invisible to
    // a suite running in another process at the same moment:
    // `src/components/__tests__/ownership.test.ts` had a job seeded and gone
    // before it read it back. Each file still gets its own fork, so module state
    // stays isolated; only the wall clock is serial.
    fileParallelism: false,
  },
});
