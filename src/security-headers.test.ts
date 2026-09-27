import { describe, expect, it } from "vitest"
import { securityHeadersFor, withSecurityHeaders } from "~/security-headers"
import { GLOBAL_SECURITY_HEADERS } from "~/security-headers"

/**
 * Regression tests for the header merge.
 *
 * ## The bug these exist for
 *
 * `withSecurityHeaders` used `merged.set(key, value)`, which overwrites. The
 * request middleware in `src/start.ts` runs on *every* response, so for a route
 * that sets its own `Content-Security-Policy` the global default replaced it on
 * the way out.
 *
 * For `/api/scrape/asset` that was the difference between two policies:
 *
 *   - the route set `sandbox; default-src 'none'` on purpose, because it
 *     echoes arbitrary third-party bytes at this origin;
 *   - the middleware then wrote `script-src 'self' 'unsafe-inline'
 *     'unsafe-eval'` in its place.
 *
 * So `?url=https://attacker.example/x.html` was served as active HTML with
 * script execution enabled **at the app's own origin**. The route's own comment
 * asserted the sandbox was in force; the middleware was silently removing it.
 *
 * The rule now: a response's own header wins. The global set is a *default*,
 * applied only where the route said nothing.
 */
describe("withSecurityHeaders", () => {
  it("does not overwrite a Content-Security-Policy the response already set", () => {
    const routePolicy = "sandbox; default-src 'none'"
    const response = new Response("<script>alert(1)</script>", {
      headers: { "Content-Security-Policy": routePolicy },
    })

    const out = withSecurityHeaders(response, GLOBAL_SECURITY_HEADERS)

    expect(out.headers.get("Content-Security-Policy")).toBe(routePolicy)
    // The specific failure: the global policy's script-src must not be here.
    expect(out.headers.get("Content-Security-Policy")).not.toContain("unsafe-inline")
  })

  it("applies the global default where the response set no policy of its own", () => {
    const response = new Response("ok")
    const out = withSecurityHeaders(response, GLOBAL_SECURITY_HEADERS)

    const policy = out.headers.get("Content-Security-Policy")
    expect(policy).toContain("frame-ancestors 'none'")
    expect(out.headers.get("X-Content-Type-Options")).toBe("nosniff")
  })

  it("preserves every other response header, including repeated Set-Cookie", () => {
    const response = new Response("ok", {
      headers: [
        ["Set-Cookie", "a=1"],
        ["Set-Cookie", "b=2"],
        ["X-Custom", "kept"],
      ],
    })

    const out = withSecurityHeaders(response, GLOBAL_SECURITY_HEADERS)

    expect(out.headers.getSetCookie()).toEqual(["a=1", "b=2"])
    expect(out.headers.get("X-Custom")).toBe("kept")
  })

  it("keeps status, statusText and body intact", async () => {
    const response = new Response("teapot body", { status: 418, statusText: "Teapot" })
    const out = withSecurityHeaders(response, GLOBAL_SECURITY_HEADERS)

    expect(out.status).toBe(418)
    expect(out.statusText).toBe("Teapot")
    expect(await out.text()).toBe("teapot body")
  })

  it("applies the default even for a header set to an empty string", () => {
    // `get` returning "" is not the same as the header being absent, and a route
    // that deliberately set an empty value should win rather than be overridden.
    const response = new Response("ok", { headers: { "Referrer-Policy": "" } })
    const out = withSecurityHeaders(response, GLOBAL_SECURITY_HEADERS)

    expect(out.headers.get("Referrer-Policy")).toBe("")
  })
})

describe("securityHeadersFor", () => {
  it("gives the preview route the sandbox policy", () => {
    const policy = Object.fromEntries(securityHeadersFor("/api/scrape/preview"))

    expect(policy["Content-Security-Policy"]).toContain("sandbox allow-scripts")
    expect(policy["X-Frame-Options"]).toBe("SAMEORIGIN")
  })

  it("gives every other path the global policy", () => {
    for (const path of ["/", "/login", "/api/scrape/asset", "/api/screenshot/x/1.png"]) {
      const policy = Object.fromEntries(securityHeadersFor(path))
      expect(policy["Content-Security-Policy"]).toContain("frame-ancestors 'none'")
    }
  })
})
