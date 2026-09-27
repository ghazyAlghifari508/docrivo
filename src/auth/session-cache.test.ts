import { beforeEach, describe, expect, it, vi } from "vitest"
// A static import, not `require`: `vi.mock` is hoisted above the imports by
// vitest's transform, so the module under test is already stubbed by the time
// this binding is initialised. `require` does not exist in this ESM graph.
import { authMiddleware, cachedSession, type SessionResolver } from "./middleware"

/**
 * F3: the session must resolve exactly once per request.
 *
 * The mechanism this file pins is a `WeakMap` keyed on the request's own
 * `Headers` object, and the reason it is keyed that way is specific rather than
 * convenient. Read out of the installed `@tanstack/start-server-core`:
 *
 *     function getRequestHeaders() { return getH3Event().req.headers }
 *
 * and `requestHandler` creates exactly one `H3Event` per request and runs the
 * whole handler inside `eventStorage.run({ h3Event }, ...)`. So every
 * `getRequestHeaders()` call *within one request* returns the identical `Headers`
 * instance, and two concurrent requests have two different ones. A `WeakMap` on
 * that object is therefore a per-request cache with no cross-request leakage, no
 * AsyncLocalStorage plumbing of our own, and no leak -- the entry dies with the
 * headers.
 *
 * The alternatives were both worse and both are worth recording. A module-level
 * variable would serve one visitor's session to the next concurrent request. A
 * per-process TTL cache would still be shared across requests, and would also keep
 * a signed-out answer alive after sign-out.
 *
 * Nothing here needs a server: the middleware handler is called directly with a
 * fake `next`, which is the arrangement `src/auth/middleware.test.ts` already
 * established.
 */

const USER = { id: "00000000-0000-0000-0000-00000000000a", email: "u@example.com", name: "U" }
const SESSION = { user: USER, session: { id: "s-1" } }

const hoisted = vi.hoisted(() => {
  const getSession = vi.fn(async () => ({ user: null, session: { id: "s" } }))
  return {
    getSession,
    // A stable `Headers` per "request", swapped by the tests below. Mutating this
    // is how a second request is simulated.
    state: { current: null as Headers | null },
  }
})

vi.mock("./server", () => ({
  auth: { api: { getSession: hoisted.getSession } },
}))

vi.mock("@tanstack/react-start/server", () => ({
  getRequestHeaders: () => {
    if (!hoisted.state.current) throw new Error("No StartEvent found")
    return hoisted.state.current
  },
}))

const next = async (options?: { context?: unknown }) => ({ options }) as never

const callMiddleware = () => {
  const handler = authMiddleware.options.server as (options: unknown) => Promise<unknown>
  return handler({
    data: undefined,
    context: {},
    next,
    method: "GET",
    serverFnMeta: undefined,
    signal: new AbortController().signal,
  })
}

const resolver = (session: unknown = SESSION): SessionResolver =>
  vi.fn(async () => session) as unknown as SessionResolver & ReturnType<typeof vi.fn>

beforeEach(() => {
  hoisted.getSession.mockClear()
  hoisted.state.current = new Headers()
})

describe("the per-request session cache", () => {
  it("resolves once for three server functions in the same request", async () => {
    const spy = resolver()

    // Three server functions, one request: a page whose loader calls `listJobs`
    // and `listScrapes` plus the root loader's `getSession` is exactly this.
    const results = await Promise.all([
      cachedSession(hoisted.state.current!, spy),
      cachedSession(hoisted.state.current!, spy),
      cachedSession(hoisted.state.current!, spy),
    ])

    expect(hoisted.getSession).toHaveBeenCalledTimes(0)
    // The count, not the value: three different session objects would still be
    // three sessions' worth of work for one visitor.
    expect(results).toHaveLength(3)
    expect(results.every((r) => r === results[0])).toBe(true)
  })

  it("resolves again for a different request", async () => {
    const first = new Headers({ cookie: "a=1" })
    const second = new Headers({ cookie: "b=2" })
    const spy = resolver()

    await cachedSession(first, spy)
    await cachedSession(second, spy)

    // A cache that survived the request would serve the first visitor's session to
    // the second, which is the failure this whole mechanism exists to prevent.
    expect(spy).toHaveBeenCalledTimes(2)
  })

  it("collapses concurrent calls rather than only sequential ones", async () => {
    // SSR runs a route's loaders in parallel, so the second lookup starts before
    // the first has answered. Caching the *promise* rather than the resolved value
    // is what makes this collapse; caching the value would still allow two
    // lookups, because both would find nothing in the map.
    const headers = new Headers()
    let release!: () => void
    const gate = new Promise<void>((resolve) => {
      release = resolve
    })
    const spy = vi.fn(async () => {
      await gate
      return SESSION
    })

    const pending = [
      cachedSession(headers, spy),
      cachedSession(headers, spy),
      cachedSession(headers, spy),
    ]
    release()
    await Promise.all(pending)

    expect(spy).toHaveBeenCalledTimes(1)
  })

  it("caches a signed-out answer too", async () => {
    // A page must not see a session in its root loader and no session in a child
    // loader. A cache that stored only truthy results would produce exactly that,
    // and the visible symptom is a page that renders the signed-out nav over
    // signed-in data.
    const headers = new Headers()
    const spy = resolver(null)

    expect(await cachedSession(headers, spy)).toBeNull()
    expect(await cachedSession(headers, spy)).toBeNull()
    expect(spy).toHaveBeenCalledTimes(1)
  })

  it("caches a rejected lookup, so one request cannot see two different failures", async () => {
    // Fail-closed and consistent. Retrying inside the request would mean the
    // second caller could succeed where the first failed, and the page would be
    // assembled from two different answers.
    const headers = new Headers()
    const spy = vi.fn(async () => {
      throw new Error("connection terminated")
    })

    await expect(cachedSession(headers, spy)).rejects.toThrow("connection terminated")
    await expect(cachedSession(headers, spy)).rejects.toThrow("connection terminated")
    expect(spy).toHaveBeenCalledTimes(1)
  })
})

describe("authMiddleware through the cache", () => {
  it("calls the session resolver once for three invocations of the middleware", async () => {
    // The production path rather than the helper: three server functions in one
    // request is what a page load actually does, and the assertion is on
    // `auth.api.getSession`, which is the real database round trip.
    await callMiddleware()
    await callMiddleware()
    await callMiddleware()

    expect(hoisted.getSession).toHaveBeenCalledTimes(1)
  })

  it("calls it again once the request changes", async () => {
    await callMiddleware()
    hoisted.state.current = new Headers()
    await callMiddleware()

    expect(hoisted.getSession).toHaveBeenCalledTimes(2)
  })

  it("gives every invocation the same user, from one lookup", async () => {
    hoisted.getSession.mockResolvedValueOnce(SESSION as never)
    const headers = new Headers()
    hoisted.state.current = headers

    const first = (await callMiddleware()) as { options: { context: { user: unknown } } }
    const second = (await callMiddleware()) as { options: { context: { user: unknown } } }

    expect(first.options.context.user).toEqual(USER)
    expect(second.options.context.user).toEqual(USER)
    expect(hoisted.getSession).toHaveBeenCalledTimes(1)
  })

  it("still answers a signed-out request with user null rather than throwing", async () => {
    hoisted.getSession.mockResolvedValueOnce({ user: null, session: { id: "s" } } as never)

    const result = (await callMiddleware()) as { options: { context: { user: unknown } } }

    expect(result.options.context.user).toBeNull()
  })
})
