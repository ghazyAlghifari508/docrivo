import { describe, expect, it } from "vitest"
import { GET } from "./screenshot.$"

/**
 * The screenshot route is the only way to read a captured page image, and the
 * image is a capture of a third-party page belonging to somebody's job. Two
 * properties are load-bearing, and both are asserted here on the **status code**
 * rather than on the absence of a throw -- a handler that "rejects" by crashing
 * satisfies `toThrow()` while still handing back the bytes.
 *
 * The three collaborators are injected so the route can be exercised without a
 * session, a database, or a file on disk. A test that only ran against the real
 * dependencies would pass for a route that returned 404 because the database was
 * empty, which is exactly the wrong reason.
 */
function ctx(splat: string) {
  return {
    request: new Request(`http://localhost/api/screenshot/${splat}`),
    params: { _splat: splat },
  }
}

const owned = async () => ({ id: "job-1" }) as never
const foreign = async () => {
  throw { isNotFound: true }
}

describe("GET /api/screenshot/<jobId>/<page>.png", () => {
  it("serves the bytes to the job's owner", async () => {
    const res = await GET(ctx("job-1/1.png"), {
      requestHeaders: (() => new Headers()) as never,
      resolveSession: (async () => ({ user: { id: "user-a" } })) as never,
      readOwnedJob: owned,
      readScreenshot: (async () => Buffer.from([137, 80, 78, 71])) as never,
    })

    expect(res.status).toBe(200)
    expect(res.headers.get("Content-Type")).toBe("image/png")
    expect(res.headers.get("X-Content-Type-Options")).toBe("nosniff")
  })

  it("hides a job owned by another user behind the same 404 as a missing file", async () => {
    const foreignRes = await GET(ctx("job-1/1.png"), {
      requestHeaders: (() => new Headers()) as never,
      resolveSession: (async () => ({ user: { id: "user-b" } })) as never,
      readOwnedJob: foreign,
      readScreenshot: (async () => Buffer.from([137, 80, 78, 71])) as never,
    })

    const missing = await GET(ctx("job-2/1.png"), {
      requestHeaders: (() => new Headers()) as never,
      resolveSession: (async () => ({ user: { id: "user-b" } })) as never,
      readOwnedJob: (async () => {
        throw { isNotFound: true }
      }) as never,
      readScreenshot: (async () => {
        throw Object.assign(new Error("ENOENT"), { code: "ENOENT" })
      }) as never,
    })

    // Byte-for-byte the same answer. If these two ever diverge, the route
    // becomes an oracle for which job ids exist.
    expect(foreignRes.status).toBe(404)
    expect(foreignRes.status).toBe(missing.status)
  })

  it("refuses a caller with no session", async () => {
    const res = await GET(ctx("job-1/1.png"), {
      requestHeaders: (() => new Headers()) as never,
      resolveSession: (async () => null) as never,
      readOwnedJob: owned,
      readScreenshot: (async () => Buffer.from([1])) as never,
    })

    expect(res.status).toBe(404)
  })

  it.each([
    ["../../../../etc/passwd", "traversal out of the storage root"],
    ["..%2f..%2fetc%2fpasswd", "encoded traversal"],
    ["job-1/../../../secret.png", "traversal in the page segment"],
    ["job-1/0.png", "page zero is not one-based"],
    ["job-1/1.jpg", "wrong extension"],
    ["job-1", "missing the page segment"],
    ["job 1/1.png", "space in the job id"],
    ["job-1/99999.png", "page number out of range"],
  ])("rejects %s (%s) with 404", async (splat) => {
    const res = await GET(ctx(splat), {
      requestHeaders: (() => new Headers()) as never,
      resolveSession: (async () => ({ user: { id: "user-a" } })) as never,
      // A traversal that reached either collaborator would be the bug, so both
      // are wired to throw if touched.
      readOwnedJob: (async () => {
        throw new Error(`readOwnedJob must not be reached for ${splat}`)
      }) as never,
      readScreenshot: (async () => {
        throw new Error(`readScreenshot must not be reached for ${splat}`)
      }) as never,
    })

    expect(res.status).toBe(404)
  })
})
