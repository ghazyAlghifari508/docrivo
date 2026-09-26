import { afterEach, describe, expect, it, vi } from "vitest"
import { isNotFound } from "@tanstack/react-router"
import { isAdminEmail, requireAdmin } from "./admin"
import { adminAllowlist } from "./allowlist"

// The server handler reads the request through `getRequestHeaders()`, which needs
// a live request context this test has no way to provide. Stubbing it is enough:
// the headers it hands over still reach the real `auth.api.getSession`.
vi.mock("@tanstack/react-start/server", () => ({
  getRequestHeaders: () => new Headers(),
}))

/** Addresses used only as allowlist fixtures. Not credentials, never real. */
const MEMBER = "admin@example.com"
const SECOND_MEMBER = "ops@example.com"
const OUTSIDER = "nobody@example.net"

describe("session middleware", () => {
  it("exposes a session resolver that rejects an unauthenticated request", async () => {
    const { resolveSession } = await import("./middleware")
    const session = await resolveSession(new Headers())
    expect(session).toBeNull()
  })

  it("resolves an unauthenticated request to null rather than throwing", async () => {
    const { resolveSession } = await import("./middleware")
    // `resolves` is the assertion that matters: a session lookup that rejected
    // would be indistinguishable at the call site from a database outage, which
    // is why the middleware must not branch on a thrown error.
    await expect(resolveSession(new Headers())).resolves.toBeNull()
  })

  it("resolves to null for a request carrying no session cookie", async () => {
    const { resolveSession } = await import("./middleware")
    const headers = new Headers({ cookie: "docrivo_session=not-a-real-token" })
    await expect(resolveSession(headers)).resolves.toBeNull()
  })

  it("exports a server-function middleware", async () => {
    const { authMiddleware } = await import("./middleware")
    // A function middleware carries both a client and a server handler; a
    // `type: "request"` one carries only `server`.
    expect(typeof authMiddleware.options.client).toBe("function")
    expect(typeof authMiddleware.options.server).toBe("function")
  })

  it("puts a null user in context for an unauthenticated request instead of throwing", async () => {
    const { authMiddleware } = await import("./middleware")
    const contexts: unknown[] = []
    const next = async (options?: { context?: unknown }) => {
      contexts.push(options?.context)
      return { marker: "next-result" } as never
    }

    const handler = authMiddleware.options.server as (options: unknown) => Promise<unknown>

    // The point of the deviation: a logged-out caller is a normal outcome that
    // reaches the route as `user: null`, not an exception indistinguishable
    // from a failed session lookup.
    const result = await handler({
      data: undefined,
      context: {},
      next,
      method: "GET",
      serverFnMeta: undefined,
      signal: new AbortController().signal,
    })

    expect(contexts).toEqual([{ user: null }])
    expect(result).toEqual({ marker: "next-result" })
  })
})

describe("admin allowlist", () => {
  const original = process.env.ADMIN_EMAILS

  afterEach(() => {
    if (original === undefined) {
      delete process.env.ADMIN_EMAILS
    } else {
      process.env.ADMIN_EMAILS = original
    }
  })

  it("reads a comma-separated list from ADMIN_EMAILS", () => {
    process.env.ADMIN_EMAILS = `${MEMBER},${SECOND_MEMBER}`
    expect(adminAllowlist()).toEqual([MEMBER, SECOND_MEMBER])
  })

  it("matches an allowlisted address regardless of case", () => {
    process.env.ADMIN_EMAILS = "Admin@Example.COM"
    expect(isAdminEmail(MEMBER)).toBe(true)
    expect(isAdminEmail("ADMIN@EXAMPLE.COM")).toBe(true)
    expect(isAdminEmail("aDmIn@eXaMpLe.CoM")).toBe(true)
  })

  it("tolerates whitespace around every entry", () => {
    process.env.ADMIN_EMAILS = `  ${MEMBER} ,\t${SECOND_MEMBER}\n`
    expect(adminAllowlist()).toEqual([MEMBER, SECOND_MEMBER])
    expect(isAdminEmail(MEMBER)).toBe(true)
    expect(isAdminEmail(SECOND_MEMBER)).toBe(true)
  })

  it("drops empty entries rather than matching the empty string", () => {
    process.env.ADMIN_EMAILS = `,${MEMBER},,  ,${SECOND_MEMBER},`
    expect(adminAllowlist()).toEqual([MEMBER, SECOND_MEMBER])
    expect(isAdminEmail("")).toBe(false)
  })

  it("admits nobody when ADMIN_EMAILS is unset", () => {
    delete process.env.ADMIN_EMAILS
    expect(adminAllowlist()).toEqual([])
    expect(isAdminEmail(MEMBER)).toBe(false)
    expect(isAdminEmail(SECOND_MEMBER)).toBe(false)
  })

  it("admits nobody when ADMIN_EMAILS is empty or only separators", () => {
    process.env.ADMIN_EMAILS = ""
    expect(adminAllowlist()).toEqual([])
    expect(isAdminEmail(MEMBER)).toBe(false)

    process.env.ADMIN_EMAILS = " , ,"
    expect(adminAllowlist()).toEqual([])
    expect(isAdminEmail(MEMBER)).toBe(false)
  })

  it("rejects an address that is not on the list", () => {
    process.env.ADMIN_EMAILS = `${MEMBER},${SECOND_MEMBER}`
    expect(isAdminEmail(OUTSIDER)).toBe(false)
  })

  it("rejects a near miss rather than matching loosely", () => {
    process.env.ADMIN_EMAILS = MEMBER
    expect(isAdminEmail(`${MEMBER}.attacker.example`)).toBe(false)
    expect(isAdminEmail(`x${MEMBER}`)).toBe(false)
    expect(isAdminEmail("admin@example.co")).toBe(false)
  })

  it("answers with a boolean and never hands back the allowlist", () => {
    process.env.ADMIN_EMAILS = `${MEMBER},${SECOND_MEMBER}`
    const answers = [MEMBER, SECOND_MEMBER, OUTSIDER, "", "not-an-email"].map((email) =>
      isAdminEmail(email),
    )

    for (const answer of answers) {
      expect(answer).toBeTypeOf("boolean")
      expect(Array.isArray(answer)).toBe(false)
    }

    // A non-member's `false` must be the same `false` as every other
    // non-member's, so the answer is not an oracle for who is on the list.
    expect(answers).toEqual([true, true, false, false, false])
    expect(JSON.stringify(answers)).not.toContain("example.com")
  })

  it("raises no error whose message could carry the allowlist", () => {
    process.env.ADMIN_EMAILS = `${MEMBER},${SECOND_MEMBER}`
    expect(() => isAdminEmail("")).not.toThrow()
    expect(() => isAdminEmail(OUTSIDER)).not.toThrow()
  })
})

/** Returns what `run` threw, or `undefined` if it completed. */
function thrownBy(run: () => void): unknown {
  try {
    run()
  } catch (thrown) {
    return thrown
  }
  return undefined
}

describe("requireAdmin", () => {
  // `ADMIN_EMAILS` is present but empty in `.env.local`, which would make the
  // admitted case below unpassable. Stub it here rather than editing the
  // environment, so the fixture address never becomes a real admin.
  afterEach(() => {
    vi.unstubAllEnvs()
  })

  it("rejects a caller with no session", () => {
    // `toThrow`, not "does not throw": `notFound()` returns its payload rather
    // than raising it, so a bare `notFound()` here would let every visitor
    // through and this assertion is the only thing standing in the way.
    expect(() => requireAdmin(null)).toThrow()
    // `toThrow()` alone is not enough for the null case. With the `throw`
    // dropped, control falls through to `sessionUser.email` and a
    // `TypeError: Cannot read properties of null` satisfies it. The refusal has
    // to be the not-found payload specifically, or a crash is being reported
    // as a rejection.
    expect(isNotFound(thrownBy(() => requireAdmin(null)))).toBe(true)
  })

  it("admits an allowlisted address", () => {
    vi.stubEnv("ADMIN_EMAILS", MEMBER)
    expect(() => requireAdmin({ email: MEMBER })).not.toThrow()
  })

  it("rejects an address that is not on the list", () => {
    vi.stubEnv("ADMIN_EMAILS", `${MEMBER},${SECOND_MEMBER}`)
    expect(() => requireAdmin({ email: OUTSIDER })).toThrow()
  })

  it("refuses with a not-found payload, never a 403", () => {
    // A 403 confirms the route exists; the 404 is the whole point of the rule.
    vi.stubEnv("ADMIN_EMAILS", MEMBER)

    expect(isNotFound(thrownBy(() => requireAdmin(null)))).toBe(true)
    expect(isNotFound(thrownBy(() => requireAdmin({ email: OUTSIDER })))).toBe(true)
  })
})
