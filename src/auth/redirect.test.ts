import { describe, expect, it } from "vitest"
import { safeNext } from "./redirect"

/** The origin a post-login redirect would be resolved against. Not a credential. */
const ORIGIN = "https://docrivo.example"
const OWN_HOST = "docrivo.example"

/** Host the attacker controls. Not a credential. */
const ATTACKER = "evil.example"

/**
 * Targets that reach the attacker-controlled origin when resolved against ORIGIN.
 * Every one of these is a redirect the guard has to refuse, so the list is the
 * guard's specification: dropping a case has to be a visible edit here.
 */
const OFF_SITE = [
  `//${ATTACKER}`,
  `//${ATTACKER}/history?next=/admin`,
  `/\\${ATTACKER}`,
  `\\\\${ATTACKER}`,
  `https://${ATTACKER}`,
  `http://${ATTACKER}`,
  `HTTPS://${ATTACKER}`,
]

/**
 * Targets that look internal but are not, because the URL parser *deletes* tab,
 * CR and LF before resolving. `/\t/evil.example` starts with a slash and still
 * leaves the origin, which is why a leading-slash check alone is not a guard.
 */
const HIDDEN_OFF_SITE = ["/\t/evil.example", "/\r\n/evil.example", "/\n/evil.example"]

/**
 * Targets carrying a raw control character. The URL parser encodes most of these
 * rather than resolving them off-origin, but they cannot be written into a
 * `Location` header intact, so a redirect that echoes one splits the response.
 */
const CONTROLLED = [
  `/\r\nLocation: https://${ATTACKER}`,
  `/\n${ATTACKER}`,
  `/\u0000/${ATTACKER}`,
  `/history\u0000?next=//${ATTACKER}`,
  `/history\u007f`,
  `/\u2028//${ATTACKER}`,
]

/** Everything the guard has to refuse. */
const REJECTED = [...OFF_SITE, ...HIDDEN_OFF_SITE, ...CONTROLLED, "", "history", `://${ATTACKER}`]

describe("safeNext", () => {
  it("allows an internal path", () => {
    expect(safeNext("/history")).toBe("/history")
  })

  it("allows an internal path with a query and a fragment", () => {
    expect(safeNext("/history?tab=1&q=a#top")).toBe("/history?tab=1&q=a#top")
  })

  it("allows the site root", () => {
    expect(safeNext("/")).toBe("/")
  })

  it("allows a double slash that is not leading", () => {
    // Only the first two characters decide. A later `//` is still same-origin.
    expect(safeNext("/docs//guide")).toBe("/docs//guide")
  })

  it("allows a nested admin path", () => {
    expect(safeNext("/admin/users")).toBe("/admin/users")
  })

  it("rejects a protocol-relative URL", () => {
    expect(safeNext(`//${ATTACKER}`)).toBeNull()
  })

  it("rejects an absolute URL", () => {
    expect(safeNext(`https://${ATTACKER}`)).toBeNull()
  })

  it("rejects a backslash-prefixed URL", () => {
    expect(safeNext(`/\\${ATTACKER}`)).toBeNull()
  })

  it("rejects a leading backslash, which has no leading slash at all", () => {
    // A separate case from the one above: `\\host` never satisfies "starts with
    // a slash", so it exercises the other half of the prefix rule.
    expect(safeNext(`\\\\${ATTACKER}`)).toBeNull()
  })

  it("rejects a target with no leading slash", () => {
    // `history` stays on-origin but resolves against the current directory, so
    // from `/admin/users` it lands on `/admin/history`. The original guard
    // refused these; so does this one.
    expect(safeNext("history")).toBeNull()
    expect(safeNext(`${ATTACKER}/history`)).toBeNull()
    expect(safeNext(" ./history")).toBeNull()
  })

  it("rejects a target whose slash is followed by a stripped control character", () => {
    // The premise, asserted rather than assumed: these look like internal paths
    // and are not, because the parser removes the character and exposes the `//`.
    for (const target of HIDDEN_OFF_SITE) {
      expect(new URL(target, ORIGIN).host).toBe(ATTACKER)
      expect(safeNext(target)).toBeNull()
    }
  })

  it("rejects every target that resolves off-origin", () => {
    for (const target of OFF_SITE) {
      expect(new URL(target, ORIGIN).host).toBe(ATTACKER)
    }

    for (const target of OFF_SITE) {
      expect(safeNext(target)).toBeNull()
    }
  })

  it("rejects a target carrying a control character", () => {
    for (const target of CONTROLLED) {
      expect(safeNext(target)).toBeNull()
    }
  })

  it("returns null for an absent or empty value instead of an empty string", () => {
    // `""` would be a redirect to the current path and the original's `"/"`
    // fallback let a rejected target land on the site root by accident. Null is
    // the only answer that forces the caller to decide where to go.
    expect(safeNext("")).toBeNull()
    expect(safeNext(null)).toBeNull()
    expect(safeNext(undefined)).toBeNull()
  })

  it("refuses by returning null, never by raising", () => {
    // Asserting the return value, not `not.toThrow()`: a guard that raised on
    // malformed input would satisfy a `toThrow()` assertion while telling the
    // caller nothing about where to send the user. `toBeNull` fails loudly on a
    // throw, and that is the outcome this contract depends on.
    for (const target of REJECTED) {
      expect(safeNext(target)).toBeNull()
    }

    expect(safeNext(" ")).toBeNull()
    expect(safeNext(String.fromCharCode(0))).toBeNull()
  })

  it("never hands back a value that leaves the origin", () => {
    // The whole contract in one assertion, over inputs spanning accepted and
    // rejected shapes: whatever comes back, resolving it stays on-site.
    const probes = [
      "/history",
      "/",
      "/docs//guide",
      "/admin/users?tab=2",
      // Same-origin for a browser, so the guard permits it; the assertion below
      // is what keeps that decision honest rather than merely asserted.
      "/%2f%2fevil.example",
      ...REJECTED,
    ]

    for (const target of probes) {
      const result = safeNext(target)
      expect(result === null || new URL(result, ORIGIN).host === OWN_HOST).toBe(true)
    }
  })
})
