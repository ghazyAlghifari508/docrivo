import { describe, expect, it } from "vitest"
import { describeRouteError } from "~/lib/errors"

/**
 * The sentence a route's error boundary shows.
 *
 * The important cases are the ones where showing `error.message` would be wrong.
 * `requireUser` throws a `Response`, which has no message at all, so the page
 * would render an empty paragraph. And a database driver puts the connection
 * string in its message -- `postgres` includes the DSN -- so echoing an
 * arbitrary error message into rendered HTML is a credential leak, not a
 * diagnostic.
 */
describe("describeRouteError", () => {
  it("describes a 401 rather than rendering nothing", () => {
    // This is what `requireUser` throws for a signed-out caller.
    const sentence = describeRouteError(new Response("Unauthorized", { status: 401 }))

    expect(sentence.length).toBeGreaterThan(0)
    expect(sentence).toContain("Masuk lagi")
  })

  it("describes a 403 without naming the route", () => {
    const sentence = describeRouteError(new Response("", { status: 403 }))

    expect(sentence).toContain("tidak punya akses")
  })

  it("describes any other Response without exposing its body", () => {
    const sentence = describeRouteError(
      new Response("internal token abc123 rejected", { status: 500 }),
    )

    expect(sentence).not.toContain("abc123")
  })

  it("shows a short, human message as-is", () => {
    expect(describeRouteError(new Error("Hasil belum tersedia."))).toBe(
      "Hasil belum tersedia.",
    )
  })

  it("refuses to show a message long enough to be a stack or a DSN", () => {
    const dsn = `connect ECONNREFUSED postgres://docrivo:hunter2@db.internal:5432/docrivo: ${"x".repeat(200)}`
    const sentence = describeRouteError(new Error(dsn))

    // The password must not reach rendered HTML.
    expect(sentence).not.toContain("hunter2")
    expect(sentence).not.toContain("db.internal")
  })

  it("falls back for a thrown value that is not an Error", () => {
    expect(describeRouteError("just a string").length).toBeGreaterThan(0)
    expect(describeRouteError(null).length).toBeGreaterThan(0)
    expect(describeRouteError(undefined).length).toBeGreaterThan(0)
  })

  it("falls back for an Error with an empty message", () => {
    expect(describeRouteError(new Error("")).length).toBeGreaterThan(0)
  })
})
