import { beforeEach, describe, expect, it } from "vitest"
import { sql } from "drizzle-orm"
import { testDb } from "~/db"
import { scrapeArtifacts } from "~/db/schema"
import { users } from "~/db/schema-auth"

const client = () => {
  if (!testDb) {
    throw new Error(
      "DATABASE_URL_TEST is not set: refusing to write to the development database",
    )
  }
  return testDb
}

/** Well-formed UUIDs: `scrape_artifacts.user_id` is `uuid`, and a non-UUID
 *  string is rejected by Postgres before the query under test runs. */
const USER_A = "00000000-0000-0000-0000-0000000000a1"
const USER_B = "00000000-0000-0000-0000-0000000000b2"

const ARTIFACT = {
  userId: USER_A,
  sourceUrl: "https://example.com/",
  status: 200,
  html: "<html><body>hello</body></html>",
  previewHtml: "<html><body>hello</body></html>",
  metadata: { attempt: 1, capturedAt: "2026-01-01T00:00:00.000Z" },
}

beforeEach(async () => {
  const c = client()
  await c.execute(sql`truncate scrape_artifacts cascade`)
  await c
    .insert(users)
    .values([
      { id: USER_A, name: "User A", email: "scrape-a@example.com" },
      { id: USER_B, name: "User B", email: "scrape-b@example.com" },
    ])
    .onConflictDoNothing()
})

const seed = (overrides: Partial<typeof ARTIFACT> = {}) =>
  client()
    .insert(scrapeArtifacts)
    .values({ ...ARTIFACT, ...overrides })
    .returning()

describe("insertScrapeArtifact", () => {
  it("stores both the raw markup and the asset-rewritten preview", async () => {
    const { insertScrapeArtifact } = await import("./scrapes")
    const stored = await insertScrapeArtifact(
      { ...ARTIFACT, previewHtml: "<html><body>rewritten</body></html>" },
      client(),
    )

    expect(stored.id).toBeTypeOf("string")
    expect(stored.userId).toBe(USER_A)
    expect(stored.status).toBe(200)
    expect(stored.html).toBe("<html><body>hello</body></html>")
    expect(stored.previewHtml).toBe("<html><body>rewritten</body></html>")
  })

  it("keeps the http status as the number it was fetched with", async () => {
    const { insertScrapeArtifact } = await import("./scrapes")
    const stored = await insertScrapeArtifact(
      { ...ARTIFACT, status: 404 },
      client(),
    )

    // `scrape_artifacts.status` is an integer HTTP status, not a state name, so
    // "not_found" here would be a type error at best.
    expect(stored.status).toBe(404)
  })
})

describe("readScrape", () => {
  it("returns the artifact to its owner", async () => {
    const [seeded] = await seed()
    const { readScrape } = await import("./scrapes")

    const found = await readScrape({ scrapeId: seeded.id, userId: USER_A }, client())
    expect(found.id).toBe(seeded.id)
    expect(found.previewHtml).toBe(ARTIFACT.previewHtml)
  })

  it("raises not-found, not forbidden, for another user's artifact", async () => {
    // The row exists -- the previous assertion just read it. Assert
    // `isNotFound`: `notFound()` returns `{ isNotFound: true }` and carries no
    // `status` field, so `toMatchObject({ status: 404 })` could never pass.
    const [seeded] = await seed()
    const { readScrape } = await import("./scrapes")

    await expect(
      readScrape({ scrapeId: seeded.id, userId: USER_B }, client()),
    ).rejects.toMatchObject({ isNotFound: true })
  })

  it("raises the same not-found for an id that does not exist", async () => {
    const { readScrape } = await import("./scrapes")

    await expect(
      readScrape(
        { scrapeId: "00000000-0000-0000-0000-0000000000ff", userId: USER_A },
        client(),
      ),
    ).rejects.toMatchObject({ isNotFound: true })
  })
})

describe("readScrapeList", () => {
  it("returns only the caller's artifacts, newest first", async () => {
    await seed({ sourceUrl: "https://older.example/" })
    await client().execute(
      sql`update scrape_artifacts set created_at = now() - interval '1 hour'
          where source_url = 'https://older.example/'`,
    )
    await seed({ sourceUrl: "https://theirs.example/", userId: USER_B })
    await seed({ sourceUrl: "https://newer.example/" })
    const { readScrapeList } = await import("./scrapes")

    const artifacts = await readScrapeList({ userId: USER_A }, client())

    expect(artifacts.map((a) => a.sourceUrl)).toEqual([
      "https://newer.example/",
      "https://older.example/",
    ])
  })

  it("returns an empty list for a user with no artifacts", async () => {
    await seed()
    const { readScrapeList } = await import("./scrapes")

    expect(await readScrapeList({ userId: USER_B }, client())).toEqual([])
  })

  it("honours an explicit limit", async () => {
    await seed({ sourceUrl: "https://one.example/" })
    await seed({ sourceUrl: "https://two.example/" })
    const { readScrapeList } = await import("./scrapes")

    expect(await readScrapeList({ userId: USER_A, limit: 1 }, client())).toHaveLength(1)
  })
})

describe("removeScrape", () => {
  it("deletes an artifact the caller owns", async () => {
    const [seeded] = await seed()
    const { removeScrape, readScrapeList } = await import("./scrapes")

    expect(await removeScrape({ scrapeId: seeded.id, userId: USER_A }, client())).toEqual({
      ok: true,
    })
    expect(await readScrapeList({ userId: USER_A }, client())).toEqual([])
  })

  it("refuses to delete another user's artifact, and leaves it in place", async () => {
    const [seeded] = await seed()
    const { removeScrape, readScrapeList } = await import("./scrapes")

    await expect(
      removeScrape({ scrapeId: seeded.id, userId: USER_B }, client()),
    ).rejects.toMatchObject({ isNotFound: true })
    // A refusal that had already deleted the row would pass the assertion above.
    expect(await readScrapeList({ userId: USER_A }, client())).toHaveLength(1)
  })
})
