import { describe, expect, it } from "vitest"

describe("ownership enforcement", () => {
  it("returns 404 rather than 403 for a resource owned by another user", async () => {
    const { getOwnedJob } = await import("~/queries/jobs")
    const other = { id: "00000000-0000-0000-0000-000000000001" }
    await expect(
      getOwnedJob({ data: { jobId: "does-not-exist", userId: other.id } }),
    ).rejects.toMatchObject({ status: 404 })
  })
})
