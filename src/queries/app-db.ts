import type { DbClient } from "~/db"

/**
 * The application database, imported lazily.
 *
 * ## Why this module exists
 *
 * Every query module in `src/queries/` is statically imported by at least one
 * route or component -- `src/queries/plans.ts` by `/` and `/pricing`,
 * `src/queries/jobs.ts` by `/history` and `/admin`, and so on. A static
 * `import { db } from "~/db"` in any of them therefore links the `postgres`
 * driver and all fifteen `pgTable` definitions into `dist/client`, where the
 * driver and the Better Auth config each **throw on evaluation in a browser**.
 * The result is a client bundle that dies during hydration on every route, while
 * `tsc --noEmit`, `vitest`, `eslint`, `vite build` and an `HTTP 200` on `/` all
 * report success. The final review found this leak; no gate in the project could,
 * because none of them inspect the built client output.
 *
 * A dynamic import here keeps the link out of the module graph until something
 * actually executes on the server. The `import type` above is erased at compile
 * time and contributes nothing to the bundle.
 *
 * The value is cached so that several calls within one request do not each pay
 * for a module resolution. `postgres` pools per client, so the cache also
 * guarantees one pool rather than one per call site.
 */
let cached: DbClient | undefined

export async function appDb(): Promise<DbClient> {
  cached ??= (await import("~/db")).db
  return cached
}

/** Test seam: drop the cached client so a suite can point it elsewhere. */
export function resetAppDb(): void {
  cached = undefined
}
