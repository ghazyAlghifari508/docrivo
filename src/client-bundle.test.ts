import { existsSync, readFileSync, readdirSync, statSync } from "node:fs"
import path from "node:path"
import { describe, expect, it } from "vitest"

/**
 * The client bundle must not contain server-only code.
 *
 * ## Why this test exists
 *
 * The final review of the migration found that `dist/client` shipped the whole
 * Better Auth server, the `postgres` driver and all fifteen `pgTable`
 * definitions. Two of those modules **throw on evaluation in a browser**, so
 * hydration died on every route -- while `tsc --noEmit`, `vitest`, `eslint`,
 * `vite build` and an `HTTP 200` on `/` all reported success. Five separate gates
 * were green over a bundle that could not run.
 *
 * The root cause was structural: `src/auth/middleware.ts` is unavoidably in the
 * client graph, because `src/start.ts` is (function middleware runs on the
 * client too, which is what makes an in-app navigation hit the same auth guard a
 * full page load does). Its top-level `import { auth } from "./server"` therefore
 * linked the auth server, and through it the database client, into the browser.
 * A dynamic import alone does not fix that class of bug -- a bundler treats
 * `import()` as a *loading* boundary and ships the module as a lazy chunk. It
 * only worked because the reference sat inside `authMiddleware`'s `.server()`
 * body, which the Start plugin strips from the client build.
 *
 * So this is a guard, not a test of behaviour. It reads the built output, which
 * is the only place this defect is visible at all.
 *
 * ## Cost, and why it is worth it
 *
 * It needs `vite build` to have run. If `dist/client` is absent the suite
 * **skips** rather than fails, so a developer who has not built is not punished
 * for a stale tree -- but a CI run that builds first is protected. Delete the
 * skip if your pipeline guarantees a build.
 */
const CLIENT_DIR = path.resolve("dist/client/assets")

const hasBuild = existsSync(CLIENT_DIR)

/** Markers of code that throws, or that must never exist, in a browser. */
const FORBIDDEN: ReadonlyArray<readonly [string, string]> = [
  // `src/db/index.ts` throws this on evaluation when DATABASE_URL is absent.
  ["DATABASE_URL is required", "the database client"],
  // `betterAuth({ ... })` -- the whole server, ~959 kB minified.
  ["betterAuth(", "the Better Auth server"],
  ["requireLocalEmailVerified", "Better Auth server config"],
  ["trustedOrigins", "Better Auth server config"],
  // A DSN-shaped literal would be a credential in the bundle.
  ["postgres://", "a possible database connection string"],
  ["postgresql://", "a possible database connection string"],
]

function clientChunks(dir: string): string[] {
  const out: string[] = []
  for (const entry of readdirSync(dir)) {
    const full = path.join(dir, entry)
    if (statSync(full).isDirectory()) out.push(...clientChunks(full))
    else if (entry.endsWith(".js")) out.push(full)
  }
  return out
}

describe.skipIf(!hasBuild)("client bundle hygiene", () => {
  const chunks = hasBuild ? clientChunks(CLIENT_DIR) : []
  const contents = new Map(chunks.map((c) => [c, readFileSync(c, "utf8")]))

  it("found a client build to inspect", () => {
    // Guards against a false pass: if the glob silently matched nothing, every
    // assertion below would be vacuously true.
    expect(chunks.length).toBeGreaterThan(0)
  })

  it.each(FORBIDDEN)("contains no %s (%s)", (marker, what) => {
    const offenders = [...contents.entries()]
      .filter(([, text]) => text.includes(marker))
      .map(([file]) => path.basename(file))

    expect(
      offenders,
      `${what} reached the browser bundle via:\n  ${offenders.join("\n  ")}`,
    ).toEqual([])
  })

  it("is the only gate that would have caught the original defect", () => {
    // A self-check on the guard: the marker list must still describe the bug it
    // was written for. If someone "fixes" the test by shortening the list, the
    // first two entries have to survive.
    const markers = FORBIDDEN.map(([m]) => m)
    expect(markers).toContain("DATABASE_URL is required")
    expect(markers).toContain("betterAuth(")
  })

  it("contains no secret value from .env.local", () => {
    // The marker list above checks for *code* that must not ship. This checks for
    // the thing that would actually be a breach: a real credential baked into
    // the bundle.
    //
    // It reads `.env.local` and looks for the values, not the names, which is
    // why `better-auth/react`'s `get BETTER_AUTH_SECRET()` accessor is not a
    // finding. That accessor calls a runtime `import.meta.env` lookup, and Vite
    // only inlines `VITE_`-prefixed variables, so the name is present and the
    // value cannot be. Matching on names would have produced a false positive
    // here and trained everyone to ignore this test.
    if (!existsSync(".env.local")) return

    const secrets = readFileSync(".env.local", "utf8")
      .split("\n")
      .map((l) => l.trim())
      .filter((l) => l && !l.startsWith("#") && l.includes("="))
      .map((l) => l.slice(l.indexOf("=") + 1).trim().replace(/^["']|["']$/g, ""))
      // Long enough that a coincidental match is implausible; short values like
      // "1" or "id" would fire on any bundle.
      .filter((v) => v.length >= 12)

    expect(secrets.length).toBeGreaterThan(0)

    const offenders: string[] = []
    for (const [file, text] of contents) {
      for (const secret of secrets) {
        if (text.includes(secret)) {
          // Report the variable name, never the value.
          const name =
            readFileSync(".env.local", "utf8")
              .split("\n")
              .find((l) => l.trim().endsWith(secret))?.split("=")[0] ?? "?"
          offenders.push(`${path.basename(file)} contains ${name}`)
        }
      }
    }

    expect(offenders, `secret values reached the browser bundle:\n  ${offenders.join("\n  ")}`).toEqual([])
  })
})

describe("the guard is wired into the normal test run", () => {
  it("has a build step somewhere in the npm scripts", () => {
    // `npm test` alone does not build, so this suite skips without a build
    // present. If `vite build` ever disappears from the scripts, the guard
    // becomes decorative and nothing would say so.
    const pkg = JSON.parse(readFileSync("package.json", "utf8")) as {
      scripts: Record<string, string>
    }
    const combined = Object.values(pkg.scripts).join(" ")
    expect(combined).toContain("vite build")
  })
})
