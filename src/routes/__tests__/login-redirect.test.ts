import { describe, expect, it } from "vitest"
import { safeNext } from "~/auth/redirect"
import {
  DEFAULT_LOGIN_DESTINATION,
  resolveLoginDestination,
  Route,
} from "~/routes/login"

/**
 * The call-site test for `safeNext`.
 *
 * A unit test on `src/auth/redirect.ts` cannot catch a caller that throws the
 * guard away: `safeNext("https://evil.example")` correctly returns `null`, and
 * a route that then does `?? "https://evil.example"` still passes every test
 * that lives in that file. Only a test that resolves the destination the login
 * button actually hands to Better Auth can catch it.
 *
 * Every assertion below is on the *resolved destination*. None of them asserts
 * the absence of a throw: a route that "rejects" an off-origin target by
 * crashing satisfies `toThrow()` while still being broken, and that mistake has
 * already been made twice in this codebase.
 */

/**
 * The route's real `validateSearch`, invoked the way the router invokes it.
 * Read off `Route.options` rather than re-declared here, so an edit to the route
 * that stopped sanitising `next` fails this file instead of passing it.
 */
const validateSearch = Route.options.validateSearch as (
  search: Record<string, unknown>,
) => { next?: string; error?: string }

/** What the "Masuk dengan Google" button passes to `callbackURL`. */
function destinationFor(rawSearch: Record<string, unknown>): string {
  return resolveLoginDestination(validateSearch(rawSearch))
}

describe("login redirect resolution", () => {
  it("falls back to the default destination when next is missing", () => {
    expect(resolveLoginDestination({})).toBe(DEFAULT_LOGIN_DESTINATION)
    expect(resolveLoginDestination({ next: null })).toBe(DEFAULT_LOGIN_DESTINATION)
    expect(destinationFor({})).toBe(DEFAULT_LOGIN_DESTINATION)
  })

  it("never resolves an off-origin absolute URL", () => {
    // Same landing page as a missing param, not the attacker's host.
    expect(resolveLoginDestination({ next: "https://evil.example" })).toBe(
      DEFAULT_LOGIN_DESTINATION,
    )
    expect(resolveLoginDestination({ next: "https://evil.example" })).not.toContain(
      "evil.example",
    )
    expect(destinationFor({ next: "https://evil.example" })).toBe(
      DEFAULT_LOGIN_DESTINATION,
    )
  })

  it("preserves an internal path unchanged", () => {
    expect(resolveLoginDestination({ next: "/history" })).toBe("/history")
    expect(destinationFor({ next: "/history" })).toBe("/history")
  })

  it("never resolves off-origin for an encoded protocol-relative target", () => {
    const resolved = resolveLoginDestination({ next: "/%2f%2fevil.example" })
    // Preserved or rejected, both acceptable; off-origin is not.
    expect([DEFAULT_LOGIN_DESTINATION, "/%2f%2fevil.example"]).toContain(resolved)
    expect(resolved).not.toMatch(/^https?:/i)
    expect(resolved).not.toMatch(/^\/\//)
  })

  it("never resolves off-origin through the route's own validateSearch", () => {
    for (const next of [
      "https://evil.example",
      "http://evil.example",
      "//evil.example",
      "/\\evil.example",
      "javascript:alert(1)",
      "evil.example",
    ]) {
      const resolved = destinationFor({ next })
      expect(resolved).toBe(DEFAULT_LOGIN_DESTINATION)
      expect(resolved).not.toContain("evil.example")
    }
  })

  it("ignores a non-string next rather than coercing it", () => {
    expect(
      resolveLoginDestination({ next: undefined }),
    ).toBe(DEFAULT_LOGIN_DESTINATION)
    expect(destinationFor({ next: { toString: () => "https://evil.example" } })).toBe(
      DEFAULT_LOGIN_DESTINATION,
    )
  })

  it("agrees with safeNext on which targets are acceptable", () => {
    // Pins the composition: the route must not widen what the guard allows.
    for (const candidate of [
      "/history",
      "/setting",
      "//evil.example",
      "/\\evil.example",
      "https://evil.example",
      "history",
      "",
    ]) {
      const expected = safeNext(candidate) ?? DEFAULT_LOGIN_DESTINATION
      expect(resolveLoginDestination({ next: candidate })).toBe(expected)
    }
  })
})
