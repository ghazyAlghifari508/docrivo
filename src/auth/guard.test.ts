import { beforeEach, describe, expect, it, vi } from "vitest"
import { isRedirect, notFound } from "@tanstack/react-router"
import {
  guardLocation,
  redirectSignedIn,
  requireAdminSession,
  requireSession,
} from "./guard"

/**
 * The three route guards, as pure decisions.
 *
 * Every one of them is `throw`-shaped rather than `return`-shaped on purpose, and
 * every assertion below checks *which* payload was thrown rather than that
 * something was. `requireAdmin` in `src/auth/admin.ts` documents why: `notFound()`
 * and `redirect()` both **return** their payload unless a caller raises it, so a
 * guard written as `notFound()` without `throw` admits every visitor through while
 * still reading as a guard. A `toThrow()` assertion would pass on that version.
 */

const USER = { id: "00000000-0000-0000-0000-00000000000a", email: "u@example.com", name: "User" }
const MEMBER = "admin@example.com"
const OUTSIDER = "nobody@example.net"

const signedIn = (user = USER) => ({ session: { user } })

/** What the guard threw, or `undefined` if it completed. */
function thrownBy(run: () => unknown): unknown {
  try {
    run()
  } catch (thrown) {
    return thrown
  }
  return undefined
}

/**
 * The destination a thrown redirect actually sends the browser to.
 *
 * Read from the `Location` header rather than from `response.options.href`,
 * because the header is what leaves the server. `redirect()` returns a `Response`
 * with both, and the two could drift; the header is the one that is observable by
 * the person being redirected, which is the one being tested.
 */
const locationOf = (thrown: unknown): string | null => {
  if (!(thrown instanceof Response)) return null
  return thrown.headers.get("Location")
}

beforeEach(() => {
  vi.stubEnv("ADMIN_EMAILS", MEMBER)
})

describe("requireSession", () => {
  it("admits a signed-in caller and hands back the user", () => {
    expect(requireSession(signedIn(), "/history")).toEqual(USER)
  })

  it("redirects a signed-out caller to the login page", () => {
    const thrown = thrownBy(() => requireSession({ session: { user: null } }, "/history"))

    expect(isRedirect(thrown)).toBe(true)
    // The destination, not merely "a redirect": a guard that redirected to `/`
    // would satisfy `isRedirect` and send a signed-out visitor somewhere useless.
    expect(locationOf(thrown)).toContain("/login")
  })

  it("remembers where the visitor was going", () => {
    const thrown = thrownBy(() => requireSession({}, "/history?page=2"))

    expect(locationOf(thrown)).toContain(`next=${encodeURIComponent("/history?page=2")}`)
  })

  it("never puts an off-origin target in the redirect", () => {
    // The guard builds the login URL itself, so it is the one place an attacker-
    // supplied `from` could turn a bounce into an open redirect. `safeNext` is
    // applied, and the login route sanitises `next` again on arrival -- two
    // independent checks, because the second one is the one that was audited.
    for (const from of [
      "https://evil.example/steal",
      "//evil.example",
      "/\\evil.example",
      "javascript:alert(1)",
    ]) {
      const location = locationOf(thrownBy(() => requireSession({}, from)))
      expect(location).not.toContain("evil.example")
      expect(location).not.toContain("javascript")
    }
  })

  it("omits next entirely for a target it cannot vouch for", () => {
    const location = locationOf(thrownBy(() => requireSession({}, "https://evil.example")))
    expect(location).not.toContain("next=")
  })

  it("refuses a context that has no session at all", () => {
    // Distinct from `{ session: { user: null } }`. A guard written as
    // `if (!context.session) return user` would treat the missing shape as
    // admitted; the missing shape is the one a half-finished migration produces.
    expect(isRedirect(thrownBy(() => requireSession({}, "/history")))).toBe(true)
    expect(isRedirect(thrownBy(() => requireSession({ session: undefined }, "/history")))).toBe(
      true,
    )
  })
})

describe("requireAdminSession", () => {
  it("admits an allowlisted address", () => {
    expect(requireAdminSession(signedIn({ ...USER, email: MEMBER }))).toEqual({
      ...USER,
      email: MEMBER,
    })
  })

  it("answers not-found for a signed-out caller, never a redirect and never a 403", () => {
    const thrown = thrownBy(() => requireAdminSession({ session: { user: null } }))

    // Not `isRedirect`: a signed-out visitor being bounced to /login would tell
    // them /admin exists, and would send them somewhere the moment they sign in.
    // Not a 403 either, for the same reason. The answer has to be the same one a
    // URL that does not exist gives.
    expect(isNotFoundPayload(thrown)).toBe(true)
    expect(isRedirect(thrown)).toBe(false)
  })

  it("answers the same not-found for an address that is not on the list", () => {
    const signedOut = thrownBy(() => requireAdminSession({ session: { user: null } }))
    const notAdmin = thrownBy(() =>
      requireAdminSession(signedIn({ ...USER, email: OUTSIDER })),
    )

    // The two must be indistinguishable, or the answer becomes an oracle for which
    // addresses are administrators.
    expect(JSON.stringify(notAdmin)).toBe(JSON.stringify(signedOut))
  })

  it("refuses with the router's not-found payload rather than an error", () => {
    const thrown = thrownBy(() => requireAdminSession(signedIn({ ...USER, email: OUTSIDER })))

    expect(thrown).toEqual(notFound())
  })

  it("refuses when ADMIN_EMAILS is unset", () => {
    // Fail closed. An unset allowlist admitting everyone would make the
    // misconfiguration the most dangerous possible one.
    vi.stubEnv("ADMIN_EMAILS", "")
    const thrown = thrownBy(() => requireAdminSession(signedIn({ ...USER, email: MEMBER })))
    expect(isNotFoundPayload(thrown)).toBe(true)
  })
})

describe("redirectSignedIn", () => {
  it("sends a signed-in visitor away from the login page", () => {
    const thrown = thrownBy(() => redirectSignedIn(signedIn()))

    expect(isRedirect(thrown)).toBe(true)
    expect(locationOf(thrown)).not.toContain("/login")
  })

  it("admits a signed-out visitor, and answers nothing", () => {
    // Not `expect(() => ...).not.toThrow()` alone: a guard that threw *some*
    // payload would pass that. The return value is the whole contract.
    expect(redirectSignedIn({ session: { user: null } })).toBeUndefined()
    expect(redirectSignedIn({})).toBeUndefined()
  })
})

describe("guardLocation", () => {
  it("builds a path and query, never an absolute url", () => {
    // `location.href` is the full url including origin, and `safeNext` rejects
    // anything that does not start with a single slash -- so passing `href`
    // straight through would silently drop `next` on every guarded route.
    expect(
      guardLocation({ pathname: "/history", searchStr: "?page=2", hash: "" } as never),
    ).toBe("/history?page=2")
  })

  it("keeps the hash when there is one", () => {
    expect(
      guardLocation({ pathname: "/setting", searchStr: "", hash: "#billing" } as never),
    ).toBe("/setting#billing")
  })

  it("omits an empty query rather than appending a bare question mark", () => {
    expect(guardLocation({ pathname: "/profile", searchStr: "", hash: "" } as never)).toBe(
      "/profile",
    )
  })
})

/** `notFound()` returns rather than throws, so compare against its own payload. */
function isNotFoundPayload(thrown: unknown): boolean {
  const expected = notFound()
  return (
    typeof thrown === "object" &&
    thrown !== null &&
    (thrown as { isNotFound?: boolean }).isNotFound === true &&
    JSON.stringify(thrown) === JSON.stringify(expected)
  )
}
