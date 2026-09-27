import { describe, expect, it } from "vitest"
import { readdirSync, readFileSync } from "node:fs"
import { join } from "node:path"
import { isRedirect, isNotFound } from "@tanstack/react-router"

/**
 * Which routes are guarded, and by what.
 *
 * Task 3.3 left six routes unauthenticated on purpose and wrote the gap on each
 * of them rather than shipping a guard that enforced on full page loads and
 * silently no-opped on in-app navigation. This file is what stops the set from
 * quietly drifting back, in both directions: a route that needs a guard and loses
 * one, and a route that gains a `beforeLoad` which is not one of the three
 * reviewed guards.
 *
 * The second direction is the one a "did you remember every route" check misses.
 * A hand-written `beforeLoad` that redirects somewhere plausible would satisfy a
 * count, so each guarded route is required to *name* the shared guard, and the
 * guards themselves are pinned behaviourally in `src/auth/guard.test.ts`.
 *
 * The list of routes needing a session is a decision, not a derivation, and it is
 * written out here rather than inferred. `generations/$id` and
 * `history/scrapes/$id` are deliberately absent: their ownership check belongs to
 * `getOwnedJob` / `getScrape`, which answer 404 for another user's row, and
 * guarding the route would turn a stale id into a redirect instead of the
 * component's own not-found state. That reasoning is restated in both route files.
 */

const ROUTES_DIR = join(process.cwd(), "src", "routes")

/** Every `createFileRoute(...)` module, `__tests__` and `api/` excepted. */
const routeFiles = () =>
  readdirSync(ROUTES_DIR, { withFileTypes: true })
    .filter((entry) => entry.isFile() && entry.name.endsWith(".tsx"))
    .map((entry) => entry.name)
    .filter((name) => !name.startsWith("__"))
    .sort()

const source = (name: string) => readFileSync(join(ROUTES_DIR, name), "utf8")

/** The file's tokens, so a guard named in a comment cannot satisfy the assertion. */
const code = (text: string) =>
  text
    .replace(/\/\*[\s\S]*?\*\//g, " ")
    .replace(/\/\/[^\n]*/g, " ")
    .replace(/\s+/g, " ")

/** The six routes Task 3.3 recorded as ungated, and what each of them must call. */
const EXPECTED_GUARDS: Record<string, string> = {
  "profile.tsx": "requireSession",
  "setting.tsx": "requireSession",
  "template.tsx": "requireSession",
  "history.tsx": "requireSession",
  "admin.tsx": "requireAdminSession",
  "login.tsx": "redirectSignedIn",
}

const GUARDED = Object.keys(EXPECTED_GUARDS).sort()

describe("the guarded route set", () => {
  it("guards exactly the routes that need a session", () => {
    // Compared as sorted sets so an addition and a removal cannot cancel out.
    const declared = routeFiles().filter((name) =>
      new RegExp(`\\b${EXPECTED_GUARDS[name] ?? "^(?!x)x"}\\b`).test(code(source(name))),
    )
    expect(declared).toEqual(GUARDED)
  })

  it("no longer says AUTH NOT ENFORCED on any route", () => {
    // Matched as the *opening words of a comment*, which is how the marker was
    // always written, rather than as a bare substring. A comment explaining that a
    // route used to carry the marker is allowed to say so; a comment opening with
    // it is an unresolved gap.
    const stale = routeFiles().filter((name) =>
      /^\s*\/\/\s*AUTH NOT ENFORCED/m.test(source(name)),
    )
    expect(stale).toEqual([])
  })

  it("no longer defers the guard to a later task", () => {
    const stale = routeFiles().filter((name) => /TODO\(Task 7\.3\)/.test(source(name)))
    expect(stale).toEqual([])
  })

  for (const [file, guard] of Object.entries(EXPECTED_GUARDS)) {
    it(`${file} calls ${guard} from a beforeLoad`, () => {
      const text = code(source(file))

      // Named import *and* the call. A guard that is imported and never called is
      // a guard that does not exist, and one that is called from a loader rather
      // than a `beforeLoad` runs after the route has already been matched.
      expect(text).toMatch(new RegExp(`import[^;]*\\b${guard}\\b[^;]*from ["']~/auth/guard["']`))
      expect(text).toMatch(new RegExp(`beforeLoad\\s*:\\s*\\(?[\\s\\S]{0,200}?${guard}\\s*\\(`))
    })

    it(`${file} is listed in the guard's own coverage note`, () => {
      // The converse sweep: a route added to the table above but with no code is
      // caught by the test above, and a route with code but not in the table is
      // caught here. Neither direction can drift alone.
      expect(GUARDED).toContain(file)
    })
  }
})

describe("the root route's session", () => {
  const root = () => code(source("__root.tsx"))

  it("resolves the session in a beforeLoad rather than a loader", () => {
    // Load-bearing, and the reason it is not the other way round. Read out of
    // `router-core/dist/esm/load-client.js`, `contextualize()` builds
    // `match.context` from the *parent's context* and then merges the
    // `beforeLoad` result into it. A parent's **loader data** is not in that
    // chain: `getLoaderContext` passes `context: match.context`, which by then
    // holds the parent's route context and beforeLoad results, never its loader
    // output. So a session returned from a root *loader* is invisible to a child's
    // `beforeLoad`, and a guard built on it would have to resolve the session a
    // second time -- reintroducing exactly the per-request cost this task closes.
    const text = root()
    const beforeLoadAt = text.indexOf("beforeLoad")
    const loaderAt = text.indexOf("loader:")

    expect(beforeLoadAt).toBeGreaterThanOrEqual(0)
    expect(loaderAt === -1 || beforeLoadAt < loaderAt).toBe(true)
    expect(text).toMatch(/beforeLoad[\s\S]{0,200}getSession\(/)
  })

  it("publishes the session as `session` so a child's context can read it", () => {
    // The key is the contract with `src/auth/guard.ts`. A rename on either side
    // would leave every guard reading `undefined`, which is indistinguishable from
    // "signed out" -- every protected page would redirect and no test of the guard
    // itself would notice.
    expect(root()).toMatch(/session\s*:\s*await\s+getSession\(\)/)
  })
})

describe("the guards, as the router will call them", () => {
  it("requireSession redirects rather than returning a falsy user", async () => {
    // The shape `beforeLoad` is given: `{ context, location, ... }`. Built here
    // rather than imported from a route so the assertion is about the contract
    // between the guard and the router, not about one file's wiring.
    const { requireSession, requireAdminSession, guardLocation } = await import("~/auth/guard")

    const from = guardLocation({
      pathname: "/history",
      searchStr: "",
      hash: "",
    } as never)

    let thrown: unknown
    try {
      requireSession({ context: { session: { user: null } }, location: { pathname: "/history" } } as never, from)
    } catch (error) {
      thrown = error
    }
    expect(isRedirect(thrown)).toBe(true)

    // And the not-admin answer, which must be the not-found payload rather than a
    // redirect: a signed-out visitor being told "log in" confirms /admin exists.
    let adminThrown: unknown
    try {
      requireAdminSession({ context: {} } as never)
    } catch (error) {
      adminThrown = error
    }
    expect(isNotFound(adminThrown)).toBe(true)
  })
})
