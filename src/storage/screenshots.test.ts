import { afterEach, describe, expect, it } from "vitest"
import { rm, stat } from "node:fs/promises"
import path from "node:path"
import { SCREENSHOT_ROOT, readScreenshot, screenshotKey, writeScreenshot } from "./screenshots"

afterEach(async () => {
  await rm(SCREENSHOT_ROOT, { recursive: true, force: true })
})

describe("screenshot key layout", () => {
  it("preserves the legacy bucket layout", () => {
    // One-based, and the extension fixed. Existing
    // `crawled_pages.screenshot_desktop_url` values were written against the
    // InsForge bucket with this exact shape, so a change here silently
    // invalidates every stored URL.
    expect(screenshotKey("job-1", 0)).toBe("job-1/1.png")
    expect(screenshotKey("job-1", 4)).toBe("job-1/5.png")
  })

  it("resolves its root to var/screenshots unless SCREENSHOT_DIR overrides it", () => {
    // The default is pinned because the test's own cleanup path has to agree
    // with it, and a mismatch would leave files behind rather than fail loudly.
    expect(SCREENSHOT_ROOT).toBe(path.resolve("var/screenshots"))
  })
})

describe("screenshot storage", () => {
  it("round-trips a screenshot", async () => {
    const bytes = Buffer.from("89504e470d0a1a0a", "hex")
    const written = await writeScreenshot("job-1", 0, bytes)

    expect(written.key).toBe("job-1/1.png")
    expect(written.url).toBe("/api/screenshot/job-1/1.png")
    // `toEqual` on a Buffer compares contents; `toBe` would compare identity
    // and pass for the same reference, which a read-from-disk never is.
    expect(await readScreenshot("job-1", 0)).toEqual(bytes)
  })

  it("overwrites rather than appends when the same page is captured twice", async () => {
    await writeScreenshot("job-1", 0, Buffer.from("first", "utf8"))
    await writeScreenshot("job-1", 0, Buffer.from("second", "utf8"))

    expect((await readScreenshot("job-1", 0)).toString("utf8")).toBe("second")
  })

  it("throws for a missing screenshot rather than returning empty bytes", async () => {
    // An empty Buffer would render as a broken image with no error anywhere; a
    // rejection is the only outcome that can reach a caller's error branch.
    await expect(readScreenshot("nope", 0)).rejects.toThrow()
  })

  it("refuses a job id that escapes the storage root", async () => {
    // `jobId` reaches this module from crawl output, which is derived from a
    // third-party page. Without the guard, `../../..` would read and write files
    // anywhere the process can reach.
    await expect(
      writeScreenshot("../escaped", 0, Buffer.from("x")),
    ).rejects.toThrow(/escapes storage root/)
  })

  it("refuses a nested job id that escapes the storage root", async () => {
    await expect(
      writeScreenshot("a/../../escaped", 0, Buffer.from("x")),
    ).rejects.toThrow(/escapes storage root/)
  })

  it("refuses a sibling directory whose name merely starts with the root's", async () => {
    // `var/screenshots-evil` begins with `var/screenshots`, so a guard written as
    // `resolved.startsWith(root)` admits it. Only the trailing separator in the
    // comparison rules this out.
    await expect(
      writeScreenshot("../screenshots-evil", 0, Buffer.from("x")),
    ).rejects.toThrow(/escapes storage root/)
  })

  it("leaves nothing behind outside the storage root", async () => {
    // Asserted per file rather than per directory: the point is that *this*
    // write created nothing, and a directory that already existed for some
    // unrelated reason would otherwise fail the test for the wrong reason.
    const escapee = path.resolve(SCREENSHOT_ROOT, "..", "escaped", "1.png")
    const sibling = path.resolve(SCREENSHOT_ROOT, "..", "screenshots-evil", "1.png")

    await writeScreenshot("../escaped", 0, Buffer.from("x")).catch(() => undefined)
    await writeScreenshot("../screenshots-evil", 0, Buffer.from("x")).catch(
      () => undefined,
    )

    await expect(stat(escapee)).rejects.toThrow()
    await expect(stat(sibling)).rejects.toThrow()
  })

  it("refuses to read through an escaping job id", async () => {
    await expect(readScreenshot("../escaped", 0)).rejects.toThrow(
      /escapes storage root/,
    )
  })
})
