import { afterEach, beforeEach, describe, expect, it } from "vitest"
import { eq, sql } from "drizzle-orm"
import { testDb } from "~/db"
import { generatedDocuments, generationJobs } from "~/db/schema"
import { users } from "~/db/schema-auth"
import { checkRateLimit } from "~/queries/rate-limit"
import {
  GLOBAL_SECURITY_HEADERS,
  PREVIEW_ROUTE_PATH,
  PREVIEW_SECURITY_HEADERS,
  securityHeadersFor,
  withSecurityHeaders,
} from "~/security-headers"

/**
 * The three HTTP routes, plus the path-scoped header selection.
 *
 * Fixtures go through `testDb`. The handlers resolve a session through the real
 * Better Auth instance, and that instance is bound to the application `db` at
 * construction -- so a test that needed a live session would have to write a
 * session row into the development database. Instead each route keeps its
 * decision in a plain function that takes the Drizzle client, and the tests
 * drive that. What is left untested is the session lookup itself, which
 * `src/auth/middleware.test.ts` already covers against the same instance.
 */
const client = () => {
  if (!testDb) {
    throw new Error(
      "DATABASE_URL_TEST is not set: refusing to write to the development database",
    )
  }
  return testDb
}

const OWNER = "00000000-0000-0000-0000-0000000000d1"
const INTRUDER = "00000000-0000-0000-0000-0000000000d2"
const JOB = "00000000-0000-0000-0000-0000000000d3"

beforeEach(async () => {
  const c = client()
  await c.execute(sql`truncate generation_jobs cascade`)
  // Both proxy routes rate-limit by forwarded address, and the bucket lives in
  // the database, so it survives between tests and between runs. Cleared here so
  // one test's traffic cannot answer 429 for the next -- which is not a
  // hypothetical: it is what happened before this line existed.
  await c.execute(sql`delete from rate_limits`)
  await c
    .insert(users)
    .values([
      { id: OWNER, name: "Owner", email: "http-owner@example.com" },
      { id: INTRUDER, name: "Intruder", email: "http-intruder@example.com" },
    ])
    .onConflictDoNothing()
  await c.insert(generationJobs).values({
    id: JOB,
    userId: OWNER,
    sourceUrl: "https://owner.example",
    normalizedDomain: "owner.example",
  })
  await c.insert(generatedDocuments).values({
    jobId: JOB,
    designMd: "# DESIGN\n\nbody",
    implementationPrompt: "# PROMPT\n\nbody",
  })
})

/**
 * A distinct forwarded address per request.
 *
 * The proxy routes read `x-forwarded-for` and key their bucket on it, which is
 * the real mechanism rather than a test seam -- and it lets each test get its
 * own bucket without the limit being the thing under test.
 */
let addressCounter = 0
const fromFreshAddress = (url: string, init?: RequestInit) =>
  new Request(url, {
    ...init,
    headers: { ...init?.headers, "x-forwarded-for": `203.0.113.${(addressCounter += 1)}` },
  })

/**
 * The rate limiter bound to `docrivo_test`.
 *
 * Both proxy routes take it as a dependency because their default is the
 * application client, and a test that exercised the default would be counting
 * against the development database's `rate_limits` table. That is not a
 * hypothetical: it is exactly what happened, and the symptom was a test that
 * passed three times and then started answering 429 as the shared bucket filled.
 */
const deps = () => ({
  checkRateLimit: (input: Parameters<typeof checkRateLimit>[0]) =>
    checkRateLimit(input, client()),
})

afterEach(async () => {
  const c = client()
  await c.delete(generatedDocuments).where(eq(generatedDocuments.jobId, JOB))
  await c.delete(generationJobs).where(eq(generationJobs.id, JOB))
})

describe("GET /api/generations/$id/download", () => {
  it("returns 404 for a download owned by another user", async () => {
    const { resolveDownload, downloadResponse } = await import(
      "../generations.$id.download"
    )

    // The row exists -- the owner case below reads it -- so a 403 here would be
    // a real leak of that fact, and the id would become probeable.
    const outcome = await resolveDownload(
      { jobId: JOB, type: "design-md", userId: INTRUDER },
      client(),
    )
    const res = downloadResponse(outcome)

    expect(res.status).toBe(404)
  })

  it("returns 404 for an id that does not exist, indistinguishably", async () => {
    const { resolveDownload, downloadResponse } = await import(
      "../generations.$id.download"
    )

    const outcome = await resolveDownload(
      { jobId: "00000000-0000-0000-0000-0000000000ff", type: "design-md", userId: OWNER },
      client(),
    )

    expect(downloadResponse(outcome).status).toBe(404)
  })

  it("serves the DESIGN.md to its owner as an attachment", async () => {
    const { resolveDownload, downloadResponse } = await import(
      "../generations.$id.download"
    )

    const outcome = await resolveDownload(
      { jobId: JOB, type: "design-md", userId: OWNER },
      client(),
    )
    const res = downloadResponse(outcome)

    expect(res.status).toBe(200)
    expect(res.headers.get("Content-Type")).toBe("text/markdown; charset=utf-8")
    // `attachment` is what makes the browser save rather than render it, and the
    // filename is what the saved file is called.
    expect(res.headers.get("Content-Disposition")).toBe(
      'attachment; filename="DESIGN.md"',
    )
    expect(await res.text()).toBe("# DESIGN\n\nbody")
  })

  it("serves the implementation prompt under its own filename", async () => {
    const { resolveDownload, downloadResponse } = await import(
      "../generations.$id.download"
    )

    const outcome = await resolveDownload(
      { jobId: JOB, type: "prompt-md", userId: OWNER },
      client(),
    )
    const res = downloadResponse(outcome)

    expect(res.headers.get("Content-Disposition")).toBe(
      'attachment; filename="IMPLEMENTATION_PROMPT.md"',
    )
    expect(await res.text()).toBe("# PROMPT\n\nbody")
  })

  it("answers 401 with no session, before it looks at the job", async () => {
    const { resolveDownload, downloadResponse } = await import(
      "../generations.$id.download"
    )

    const res = downloadResponse(
      await resolveDownload({ jobId: JOB, type: "design-md", userId: null }, client()),
    )

    // 401, not 404: the caller has not proved anything yet, and answering 404
    // would make "signed out" and "not yours" the same observation.
    expect(res.status).toBe(401)
  })

  it("answers 409, not 404, when the job has no document yet", async () => {
    const c = client()
    const [pending] = await c
      .insert(generationJobs)
      .values({
        userId: OWNER,
        sourceUrl: "https://pending.example",
        normalizedDomain: "pending.example",
      })
      .returning()
    const { resolveDownload, downloadResponse } = await import(
      "../generations.$id.download"
    )

    const res = downloadResponse(
      await resolveDownload(
        { jobId: pending.id, type: "design-md", userId: OWNER },
        client(),
      ),
    )

    // The owner has already been identified, so there is nothing to hide, and a
    // 404 here would push the polling page into its "result is gone" state for
    // a job that is still running.
    expect(res.status).toBe(409)

    await c.delete(generationJobs).where(eq(generationJobs.id, pending.id))
  })
})

describe("GET /api/scrape/preview", () => {
  it("sends scraped HTML under the sandbox policy", async () => {
    const { PREVIEW_HEADERS } = await import("../scrape.preview")

    // Asserted on the header set rather than on a response: the success path
    // needs a real browser and a reachable third-party site, so this is the only
    // place the policy can be checked -- and the policy is the control, not the
    // scrape.
    expect(PREVIEW_HEADERS["Content-Security-Policy"]).toContain("sandbox allow-scripts")
    expect(PREVIEW_HEADERS["Content-Security-Policy"]).toContain("base-uri 'none'")
    expect(PREVIEW_HEADERS["Content-Security-Policy"]).toContain("form-action 'none'")
    // `DENY` would stop the app's own preview frame from loading at all, which is
    // the opposite of the intent.
    expect(PREVIEW_HEADERS["X-Frame-Options"]).toBe("SAMEORIGIN")
    expect(PREVIEW_HEADERS["Referrer-Policy"]).toBe("no-referrer")
    expect(PREVIEW_HEADERS["Cache-Control"]).toBe("no-store, max-age=0")
  })

  it("keeps allow-same-origin out of the sandbox directive", async () => {
    const { PREVIEW_HEADERS } = await import("../scrape.preview")

    // With `allow-same-origin` the untrusted document would share the parent's
    // origin and could read its cookies. The absence is the control, so it is
    // asserted rather than left to review.
    expect(PREVIEW_HEADERS["Content-Security-Policy"]).not.toContain("allow-same-origin")
  })

  it("refuses a loopback url with the sandbox policy still on the response", async () => {
    const { GET } = await import("../scrape.preview")

    const res = await GET(
      { request: fromFreshAddress("http://localhost/api/scrape/preview?url=http://127.0.0.1/") },
      deps(),
    )

    // The SSRF guard refuses the address before any fetch. Asserting the status
    // alone would pass for a 502 from a failed fetch, so the message is checked
    // too -- and so are the headers, which must be present on an error response
    // as well as on a good one.
    expect(res.status).toBe(400)
    expect(await res.text()).toContain("Preview gagal")
    expect(res.headers.get("X-Content-Type-Options")).toBe("nosniff")
  })

  it("keeps the sandbox CSP on the error body it renders in the frame", async () => {
    const { GET } = await import("../scrape.preview")

    const res = await GET(
      { request: fromFreshAddress("http://localhost/api/scrape/preview?url=") },
      deps(),
    )

    // The frame is still a frame: the error page is rendered inside the same
    // origin-less document, so it needs the same policy.
    expect(res.headers.get("Content-Type")).toContain("text/html")
  })

  it("escapes the rejected url rather than reflecting it as markup", async () => {
    const { htmlError } = await import("../scrape.preview")

    // Reached through `htmlError` rather than through a handler: no `AppError`
    // message quotes the URL today, so a handler-level test could only ever see
    // a fixed string from `ERROR_CODES` and would pass whether or not the
    // escaping worked. The body is rendered inside a frame pointed at somebody
    // else's page, so this is the difference between a message and a script.
    const body = await htmlError("Gagal memuat <script>alert(1)</script>", 400).text()

    expect(body).not.toContain("<script>")
    expect(body).toContain("&lt;script&gt;")
  })

  it("answers 400 for a POST body that is not the expected shape", async () => {
    const { POST } = await import("../scrape.preview")

    const res = await POST(
      {
        request: fromFreshAddress("http://localhost/api/scrape/preview", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: "not json at all",
        }),
      },
      deps(),
    )

    expect(res.status).toBe(400)
  })
})

describe("GET /api/scrape/asset", () => {
  it("answers 400 without a url, and still carries the null-origin CORS header", async () => {
    const { GET } = await import("../scrape.asset")

    const res = await GET(
      { request: fromFreshAddress("http://localhost/api/scrape/asset") },
      deps(),
    )

    expect(res.status).toBe(400)
    // The sandboxed frame has origin `null`; dropping this header on the error
    // path would make the browser report a CORS failure instead of the 400, and
    // the frame's own error handling could not tell them apart.
    expect(res.headers.get("Access-Control-Allow-Origin")).toBe("*")
    expect(res.headers.get("Content-Security-Policy")).toBe("sandbox; default-src 'none'")
  })

  it("refuses a loopback url with 400 and no body", async () => {
    const { GET } = await import("../scrape.asset")

    const res = await GET(
      {
        request: fromFreshAddress(
          "http://localhost/api/scrape/asset?url=" + encodeURIComponent("http://127.0.0.1/"),
        ),
      },
      deps(),
    )

    // 400, not 502: the guard refused the address, it is not that the site would
    // not answer. And the body is empty, so the guard's reason is not echoed back
    // to whoever is probing it.
    expect(res.status).toBe(400)
    expect(await res.text()).toBe("")
  })

  it("caches a successful asset for an hour", async () => {
    const { GET } = await import("../scrape.asset")

    const res = await GET(
      {
        request: fromFreshAddress(
          "http://localhost/api/scrape/asset?url=" + encodeURIComponent("http://127.0.0.1/"),
        ),
      },
      deps(),
    )

    expect(res.headers.get("Cache-Control")).toBe("public, max-age=3600")
  })

  it("rewrites the url()s in a proxied stylesheet", async () => {
    const { GET } = await import("../scrape.asset")
    const stylesheet =
      "body{background:url('https://cdn.example/bg.png')}"

    // The rewrite is the reason this route touches a body at all: a
    // `<link rel=stylesheet>` that skipped inlining still points at the source
    // origin, and the frame's CSP blocks a direct fetch. `fetchAsset` is a
    // parameter so this is reachable without a live request -- the real one goes
    // through the SSRF guard and a socket.
    const res = await GET(
      {
        request: fromFreshAddress(
          "http://localhost/api/scrape/asset?url=" +
            encodeURIComponent("https://site.example/style.css"),
        ),
      },
      {
        ...deps(),
        async fetchAsset() {
          return {
            body: Buffer.from(stylesheet, "utf8"),
            status: 200,
            contentType: "text/css; charset=utf-8",
          }
        },
      },
    )

    const body = await res.text()
    expect(res.status).toBe(200)
    expect(res.headers.get("Content-Type")).toContain("text/css")
    // The original origin must be gone, or the browser fetches it directly and
    // the CSP blocks it.
    expect(body).not.toContain("https://cdn.example/bg.png")
    expect(body).toContain("/api/scrape/asset?url=")
  })

  it("passes a non-CSS body through untouched", async () => {
    const { GET } = await import("../scrape.asset")

    const res = await GET(
      {
        request: fromFreshAddress(
          "http://localhost/api/scrape/asset?url=" +
            encodeURIComponent("https://site.example/logo.svg"),
        ),
      },
      {
        ...deps(),
        async fetchAsset() {
          return {
            body: Buffer.from('<svg xmlns="http://www.w3.org/2000/svg"/>', "utf8"),
            status: 200,
            contentType: "image/svg+xml",
          }
        },
      },
    )

    expect(await res.text()).toContain("<svg")
  })

  it("returns an upstream error status with an empty body", async () => {
    const { GET } = await import("../scrape.asset")

    const res = await GET(
      {
        request: fromFreshAddress(
          "http://localhost/api/scrape/asset?url=" +
            encodeURIComponent("https://site.example/gone.png"),
        ),
      },
      {
        ...deps(),
        async fetchAsset() {
          return { body: Buffer.from("not found", "utf8"), status: 404, contentType: "text/plain" }
        },
      },
    )

    // The upstream status is passed through so the frame can tell a missing
    // asset from a broken one, but the body is not: a 404 page from the target
    // would be rendered as the asset.
    expect(res.status).toBe(404)
    expect(await res.text()).toBe("")
  })
})

describe("path-scoped security headers", () => {
  it("gives the preview path the sandbox policy and everything else the global one", () => {
    expect(securityHeadersFor(PREVIEW_ROUTE_PATH)).toBe(PREVIEW_SECURITY_HEADERS)
    expect(securityHeadersFor("/")).toBe(GLOBAL_SECURITY_HEADERS)
    expect(securityHeadersFor("/api/generations/abc/download")).toBe(
      GLOBAL_SECURITY_HEADERS,
    )
  })

  it("does not let a path that merely starts with the preview path take the policy", () => {
    // A prefix match would also cover a sibling route, which is served in a
    // normal document and would break under `sandbox`.
    expect(securityHeadersFor(`${PREVIEW_ROUTE_PATH}-evil`)).toBe(
      GLOBAL_SECURITY_HEADERS,
    )
  })

  it("puts the sandbox directive on the preview response, not the global frame denial", () => {
    const response = withSecurityHeaders(
      new Response("body"),
      securityHeadersFor(PREVIEW_ROUTE_PATH),
    )

    const csp = response.headers.get("Content-Security-Policy") ?? ""
    expect(csp).toContain("sandbox allow-scripts")
    expect(csp).toContain("base-uri 'none'")
    expect(csp).toContain("form-action 'none'")
    // `DENY` here would stop the app's own preview frame from loading at all.
    expect(response.headers.get("X-Frame-Options")).toBe("SAMEORIGIN")
  })

  it("keeps the global policy off the preview response", () => {
    const response = withSecurityHeaders(
      new Response("body"),
      securityHeadersFor(PREVIEW_ROUTE_PATH),
    )

    expect(response.headers.get("Content-Security-Policy")).not.toContain(
      "frame-ancestors 'none'",
    )
  })

  it("leaves a body and status untouched while copying headers", () => {
    const response = withSecurityHeaders(
      new Response("payload", { status: 418, statusText: "Teapot" }),
      securityHeadersFor("/"),
    )

    expect(response.status).toBe(418)
    expect(response.statusText).toBe("Teapot")
    expect(response.headers.get("X-Content-Type-Options")).toBe("nosniff")
  })
})
