import { beforeEach, describe, expect, it } from "vitest"
import { eq, sql } from "drizzle-orm"
import { testDb } from "~/db"
import { paymentTransactions, userEntitlements } from "~/db/schema"
import { users } from "~/db/schema-auth"

const client = () => {
  if (!testDb) {
    throw new Error(
      "DATABASE_URL_TEST is not set: refusing to write to the development database",
    )
  }
  return testDb
}

/** Well-formed UUIDs: `user_entitlements.user_id` and
 *  `payment_transactions.user_id` are `uuid` columns, and a non-UUID string is
 *  rejected by Postgres before the query under test runs. */
const USER = "00000000-0000-0000-0000-00000000000c"
const OTHER = "00000000-0000-0000-0000-00000000000d"

/**
 * The quota numbers come from the `plans` catalogue, not from the test.
 * `migrations/0005` seeds `free` with one DESIGN.md credit and one scrape
 * credit, and `proplus` with null (unlimited) for both, and those rows are the
 * reference the RPCs read. Truncating `plans` to make the numbers convenient
 * would empty the catalogue every other suite and every page depends on.
 */
const FREE_DESIGNMD_QUOTA = 1
const FREE_SCRAPE_QUOTA = 1

beforeEach(async () => {
  const c = client()
  // Only this suite's rows. `plans` is reference data and is left alone.
  await c.execute(
    sql`delete from payment_transactions where user_id in (${USER}::uuid, ${OTHER}::uuid)`,
  )
  await c.execute(
    sql`delete from user_entitlements where user_id in (${USER}::uuid, ${OTHER}::uuid)`,
  )
  await c
    .insert(users)
    .values([
      { id: USER, name: "Quota User", email: "quota@example.com" },
      { id: OTHER, name: "Other User", email: "quota-other@example.com" },
    ])
    .onConflictDoNothing()
})

/** Grants a plan by writing the entitlement row the way a purchase would. */
const setPlan = (userId: string, plan: string) =>
  client()
    .insert(userEntitlements)
    .values({ userId, plan })
    .onConflictDoUpdate({
      target: userEntitlements.userId,
      set: { plan, designmdUsed: 0, scrapeUsed: 0 },
    })

describe("consumeQuota", () => {
  it("allows the first unit and refuses the next, for the free plan's quota of one", async () => {
    const { consumeQuota } = await import("./entitlements")

    const first = await consumeQuota({ userId: USER, kind: "designmd" }, client())
    const second = await consumeQuota({ userId: USER, kind: "designmd" }, client())

    // The returned value, not the absence of a throw: a guard that "rejects" by
    // crashing satisfies a `toThrow()` assertion while being broken. The free
    // plan's whole quota is one, so the second call has to answer `allowed:
    // false` with the counters it read.
    expect(first.allowed).toBe(true)
    expect(first.plan).toBe("free")
    expect(first.quota).toBe(FREE_DESIGNMD_QUOTA)
    expect(first.remaining).toBe(0)
    expect(second.allowed).toBe(false)
    expect(second.remaining).toBe(0)
  })

  it("counts DESIGN.md and scrape HTML against separate counters", async () => {
    const { consumeQuota } = await import("./entitlements")

    const design = await consumeQuota({ userId: USER, kind: "designmd" }, client())
    const scrape = await consumeQuota({ userId: USER, kind: "scrape" }, client())

    // One shared counter would make the second call fail, and a shared
    // entitlement would show the wrong number on the settings page.
    expect(design.allowed).toBe(true)
    expect(scrape.allowed).toBe(true)

    const ent = await client()
      .select()
      .from(userEntitlements)
      .where(eq(userEntitlements.userId, USER))
    expect(ent[0]?.designmdUsed).toBe(1)
    expect(ent[0]?.scrapeUsed).toBe(1)
  })

  it("allows an unlimited plan without consuming anything", async () => {
    await setPlan(USER, "proplus")
    const { consumeQuota } = await import("./entitlements")

    const first = await consumeQuota({ userId: USER, kind: "designmd" }, client())
    const second = await consumeQuota({ userId: USER, kind: "designmd" }, client())

    // A null quota means unlimited, so `remaining` is null rather than a number
    // and the counter must not move. Incrementing here would make "unlimited"
    // mean "unlimited until the counter drifts".
    expect(first.allowed).toBe(true)
    expect(first.quota).toBeNull()
    expect(first.remaining).toBeNull()
    expect(second.allowed).toBe(true)

    const ent = await client()
      .select()
      .from(userEntitlements)
      .where(eq(userEntitlements.userId, USER))
    expect(ent[0]?.designmdUsed).toBe(0)
  })

  it("refuses a kind the database does not know", async () => {
    const { consumeQuota } = await import("./entitlements")

    // The RPC raises for anything outside ('designmd', 'scrape'). Passing the
    // string through unchecked would make a typo silently mint quota.
    await expect(
      consumeQuota({ userId: USER, kind: "designmdz" as never }, client()),
    ).rejects.toThrow()
  })

  it("never reports a negative remaining balance", async () => {
    await setPlan(USER, "starter")
    const { consumeQuota } = await import("./entitlements")

    const results = []
    for (let i = 0; i < FREE_DESIGNMD_QUOTA + 4; i += 1) {
      results.push(await consumeQuota({ userId: USER, kind: "designmd" }, client()))
    }

    for (const result of results) {
      expect(result.remaining).not.toBeLessThan(0)
      expect(result.used).not.toBeLessThan(0)
    }
  })

  it("reports the balance the RPC returned rather than a fabricated one", async () => {
    // The RPC computes `remaining` itself, and the wrapper passes it through.
    // Substituting a constant here would make the settings page show a number
    // the database never agreed to, with no error anywhere.
    const { consumeQuota } = await import("./entitlements")

    const result = await consumeQuota({ userId: USER, kind: "designmd" }, client())

    expect(result.remaining).toBe(FREE_DESIGNMD_QUOTA - 1)
    expect(result.used).toBe(1)
  })
})

describe("refundQuota", () => {
  it("gives back exactly one unit of the kind it names", async () => {
    const { consumeQuota, refundQuota } = await import("./entitlements")

    await consumeQuota({ userId: USER, kind: "designmd" }, client())
    await consumeQuota({ userId: USER, kind: "scrape" }, client())

    await refundQuota({ userId: USER, kind: "designmd" }, client())
    const counters = await readCounters(USER)

    expect(counters.designmdUsed).toBe(0)
    // The other counter must be untouched: a refund that reset both would hand
    // back a scrape credit the user never lost.
    expect(counters.scrapeUsed).toBe(1)
  })

  it("restores the credit so the next consume is allowed again", async () => {
    const { consumeQuota, refundQuota } = await import("./entitlements")

    await consumeQuota({ userId: USER, kind: "designmd" }, client())
    expect((await consumeQuota({ userId: USER, kind: "designmd" }, client())).allowed).toBe(
      false,
    )
    await refundQuota({ userId: USER, kind: "designmd" }, client())

    expect((await consumeQuota({ userId: USER, kind: "designmd" }, client())).allowed).toBe(
      true,
    )
  })

  it("clamps at zero rather than going negative", async () => {
    const { refundQuota } = await import("./entitlements")

    await refundQuota({ userId: USER, kind: "designmd" }, client())
    await refundQuota({ userId: USER, kind: "designmd" }, client())

    // `refund_quota` updates zero rows when the user has never consumed, so
    // there may be no row at all. What is not acceptable is a negative counter.
    expect(await readCounters(USER)).toEqual({ designmdUsed: 0, scrapeUsed: 0 })
  })
})

describe("getEntitlement", () => {
  it("answers a virtual free row for a user who has never consumed", async () => {
    const { getEntitlement } = await import("./entitlements")

    const ent = await getEntitlement({ userId: USER }, client())

    // `get_user_entitlement` returns zero rows until the first consume creates
    // one, so the fallback is what every new visitor sees.
    expect(ent.plan).toBe("free")
    expect(ent.designmdUsed).toBe(0)
    expect(ent.scrapeUsed).toBe(0)
    expect(ent.designmd).toEqual({
      used: 0,
      quota: FREE_DESIGNMD_QUOTA,
      remaining: FREE_DESIGNMD_QUOTA,
    })
    expect(ent.scrape).toEqual({
      used: 0,
      quota: FREE_SCRAPE_QUOTA,
      remaining: FREE_SCRAPE_QUOTA,
    })
  })

  it("reads the real row and derives remaining from the catalogue", async () => {
    const { consumeQuota, getEntitlement } = await import("./entitlements")

    await consumeQuota({ userId: USER, kind: "designmd" }, client())
    const ent = await getEntitlement({ userId: USER }, client())

    expect(ent.designmdUsed).toBe(1)
    expect(ent.designmd.remaining).toBe(0)
    expect(ent.scrape.remaining).toBe(FREE_SCRAPE_QUOTA)
  })

  it("reports an unlimited plan as unlimited rather than as a large number", async () => {
    await setPlan(USER, "proplus")
    const { getEntitlement } = await import("./entitlements")

    const ent = await getEntitlement({ userId: USER }, client())

    expect(ent.designmd.remaining).toBeNull()
    expect(ent.scrape.remaining).toBeNull()
  })

  it("never reports a negative remaining balance", async () => {
    await setPlan(USER, "starter")
    const { consumeQuota, getEntitlement } = await import("./entitlements")

    for (let i = 0; i < 10; i += 1) {
      await consumeQuota({ userId: USER, kind: "designmd" }, client())
    }

    const ent = await getEntitlement({ userId: USER }, client())
    expect(ent.designmd.remaining).toBe(0)
  })
})

describe("claimPaymentForUpgrade", () => {
  const seedTransaction = (status: string, userId = USER) =>
    client()
      .insert(paymentTransactions)
      .values({
        userId,
        orderId: "order-claim-1",
        plan: "pro",
        grossAmount: 50000,
        status,
      })
      .onConflictDoNothing()
      .returning()

  it("upgrades the plan and resets the counters when it wins the claim", async () => {
    await setPlan(USER, "free")
    await client()
      .update(userEntitlements)
      .set({ designmdUsed: 1, scrapeUsed: 1 })
      .where(eq(userEntitlements.userId, USER))
    await seedTransaction("pending")
    const { claimPaymentForUpgrade } = await import("./entitlements")

    const result = await claimPaymentForUpgrade(
      { userId: USER, orderId: "order-claim-1" },
      client(),
    )

    expect(result).toEqual({ claimed: true, plan: "pro" })
    const ent = await client()
      .select()
      .from(userEntitlements)
      .where(eq(userEntitlements.userId, USER))
    expect(ent[0]?.plan).toBe("pro")
    // A purchase resets lifetime usage -- the model in `migrations/0005`. If the
    // reset were dropped, a buyer would keep their exhausted counters.
    expect(ent[0]?.designmdUsed).toBe(0)
    expect(ent[0]?.scrapeUsed).toBe(0)
  })

  it("creates the entitlement row when the buyer has never had one", async () => {
    // A purchase is the only thing that creates a row for a user who has never
    // generated or scraped, so the insert branch of the upsert is on the real
    // path -- not only the conflict branch the other tests exercise.
    await seedTransaction("pending")
    const { claimPaymentForUpgrade } = await import("./entitlements")

    const result = await claimPaymentForUpgrade(
      { userId: USER, orderId: "order-claim-1" },
      client(),
    )

    expect(result).toEqual({ claimed: true, plan: "pro" })
    const ent = await client()
      .select()
      .from(userEntitlements)
      .where(eq(userEntitlements.userId, USER))
    expect(ent[0]?.plan).toBe("pro")
    expect(ent[0]?.designmdUsed).toBe(0)
  })

  it("lets exactly one of two concurrent claims win", async () => {
    await seedTransaction("pending")
    const { claimPaymentForUpgrade } = await import("./entitlements")

    const [first, second] = await Promise.all([
      claimPaymentForUpgrade({ userId: USER, orderId: "order-claim-1" }, client()),
      claimPaymentForUpgrade({ userId: USER, orderId: "order-claim-1" }, client()),
    ])

    // This is the assertion that `status = 'pending'` is part of the WHERE
    // clause. A read-then-write claim -- read the row, see `pending`, then
    // update it -- lets both callers through and a replayed webhook credits
    // twice.
    expect([first.claimed, second.claimed].filter(Boolean)).toHaveLength(1)
  })

  it("refuses to claim a transaction that is already paid", async () => {
    await seedTransaction("paid")
    const { claimPaymentForUpgrade } = await import("./entitlements")

    const result = await claimPaymentForUpgrade(
      { userId: USER, orderId: "order-claim-1" },
      client(),
    )

    expect(result.claimed).toBe(false)
  })

  it("refuses to claim another user's transaction", async () => {
    await seedTransaction("pending", OTHER)
    const { claimPaymentForUpgrade } = await import("./entitlements")

    // Same answer as an order id that does not exist: a 403 here would confirm
    // the id is real.
    const result = await claimPaymentForUpgrade(
      { userId: USER, orderId: "order-claim-1" },
      client(),
    )

    expect(result.claimed).toBe(false)
  })

  it("refuses an order id that does not exist", async () => {
    const { claimPaymentForUpgrade } = await import("./entitlements")

    const result = await claimPaymentForUpgrade(
      { userId: USER, orderId: "order-never-existed" },
      client(),
    )

    expect(result.claimed).toBe(false)
  })
})

describe("insertPaymentTransaction", () => {
  it("records a pending transaction for the order", async () => {
    const { insertPaymentTransaction } = await import("./entitlements")

    const tx = await insertPaymentTransaction(
      { userId: USER, orderId: "order-new-1", plan: "starter", grossAmount: 25000 },
      client(),
    )

    expect(tx.status).toBe("pending")
    expect(tx.grossAmount).toBe(25000)
  })

  it("refuses a second transaction for the same order id", async () => {
    const { insertPaymentTransaction } = await import("./entitlements")
    const row = { userId: USER, plan: "starter", grossAmount: 25000 }

    await insertPaymentTransaction({ ...row, orderId: "order-dup-1" }, client())

    // The unique constraint on `payment_transactions.order_id` is what makes the
    // order id a stable key for the Midtrans callback. A read-then-write check
    // would let two concurrent creates both succeed.
    await expect(
      insertPaymentTransaction({ ...row, orderId: "order-dup-1" }, client()),
    ).rejects.toThrow()
  })
})

/** The stored counters, so a refund can be checked against the row itself
 *  rather than against a second `consumeQuota` call that would consume again. */
const readCounters = async (userId: string) => {
  const [row] = await client()
    .select()
    .from(userEntitlements)
    .where(eq(userEntitlements.userId, userId))
  return { designmdUsed: row?.designmdUsed ?? 0, scrapeUsed: row?.scrapeUsed ?? 0 }
}
