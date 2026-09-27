import { createServerFn } from "@tanstack/react-start"
import { and, eq, sql } from "drizzle-orm"
import { db, type DbClient } from "~/db"
import { paymentTransactions, userEntitlements } from "~/db/schema"
import { failure, type ActionResult } from "~/lib/errors"
import { createSnapTransaction, getTransactionStatus } from "~/lib/midtrans"

export type QuotaKind = "designmd" | "scrape"

export type QuotaResult = {
  allowed: boolean
  plan: string
  used: number
  /** `null` means unlimited, which is why it is not `Infinity`. */
  quota: number | null
  remaining: number | null
}

export type QuotaWindow = { used: number; quota: number | null; remaining: number | null }

export type Entitlement = {
  userId: string
  plan: string
  designmdUsed: number
  scrapeUsed: number
  designmd: QuotaWindow
  scrape: QuotaWindow
}

/**
 * The quota RPCs are the source of truth and are not reimplemented here.
 *
 * `consume_quota(p_user uuid, p_kind text)` locks the entitlement row `for
 * update`, reads the plan's quota, and only then increments -- one statement, so
 * two concurrent requests cannot both pass the `used >= q` check. An
 * application-side read-then-write would be correct on one instance and wrong
 * on two, and the value being spent is money.
 *
 * The signature is the one in `migrations/0005` and `migrations/0007`: two
 * arguments, `(uuid, text)`, returning `jsonb`. It is not `(user, job, amount)`
 * -- there is no per-job accounting, and `refund_quota` likewise takes a kind
 * rather than a count, refunding exactly one unit.
 */
export async function consumeQuota(
  input: { userId: string; kind: QuotaKind },
  client: DbClient = db,
): Promise<QuotaResult> {
  const rows = await client.execute<{ result: unknown }>(
    sql`select public.consume_quota(${input.userId}::uuid, ${input.kind}::text) as result`,
  )
  return normaliseQuota(rows[0]?.result)
}

export async function refundQuota(
  input: { userId: string; kind: QuotaKind },
  client: DbClient = db,
): Promise<{ ok: true }> {
  await client.execute(
    sql`select public.refund_quota(${input.userId}::uuid, ${input.kind}::text)`,
  )
  return { ok: true }
}

/**
 * `postgres` returns a `jsonb` column already parsed, but a driver that hands
 * back the raw text would leave this a string. Both shapes are accepted so the
 * caller never has to care which one it got, and a genuinely absent value fails
 * closed -- `allowed: false` -- rather than open.
 */
function normaliseQuota(value: unknown): QuotaResult {
  const parsed: unknown =
    typeof value === "string" ? (JSON.parse(value) as unknown) : value

  if (typeof parsed !== "object" || parsed === null) {
    return { allowed: false, plan: "free", used: 0, quota: 0, remaining: 0 }
  }

  const row = parsed as Partial<QuotaResult>
  return {
    allowed: row.allowed === true,
    plan: typeof row.plan === "string" ? row.plan : "free",
    used: typeof row.used === "number" ? row.used : 0,
    quota: typeof row.quota === "number" ? row.quota : null,
    remaining: typeof row.remaining === "number" ? row.remaining : null,
  }
}

/**
 * The user's plan and counters, with the remaining balance derived from the
 * catalogue.
 *
 * `get_user_entitlement` returns only `user_id, plan, designmd_used,
 * scrape_used` and returns zero rows until the first consume creates one, so
 * both the fallback free row and the catalogue join are this function's job. A
 * virtual free row rather than null: every caller wants numbers, and the row the
 * RPC would eventually create has exactly these values.
 */
export async function getEntitlement(
  input: { userId: string },
  client: DbClient = db,
): Promise<Entitlement> {
  const [row] = await client.execute<{
    user_id: string
    plan: string
    designmd_used: number
    scrape_used: number
  }>(sql`select * from public.get_user_entitlement(${input.userId}::uuid)`)

  const catalogue = await readPlanWindows(client)
  const plan = row?.plan ?? "free"
  const windows = catalogue[plan] ?? { designmd_quota: 0, scrape_quota: 0 }

  return {
    userId: input.userId,
    plan,
    designmdUsed: row?.designmd_used ?? 0,
    scrapeUsed: row?.scrape_used ?? 0,
    designmd: window_(row?.designmd_used ?? 0, windows.designmd_quota),
    scrape: window_(row?.scrape_used ?? 0, windows.scrape_quota),
  }
}

function window_(used: number, quota: number | null): QuotaWindow {
  if (quota == null) return { used, quota: null, remaining: null }
  return { used, quota, remaining: Math.max(0, quota - used) }
}

type PlanQuotas = { designmd_quota: number | null; scrape_quota: number | null }

/** The two quota columns per plan, read once per `getEntitlement` call. */
async function readPlanWindows(
  client: DbClient,
): Promise<Record<string, PlanQuotas>> {
  const rows = await client.execute<{ plan: string } & PlanQuotas>(
    sql`select plan, designmd_quota, scrape_quota from public.list_plans()`,
  )
  return Object.fromEntries(
    rows.map((r) => [
      r.plan,
      { designmd_quota: r.designmd_quota, scrape_quota: r.scrape_quota },
    ]),
  )
}

/**
 * Flips a pending transaction to paid and, only for the caller that won that
 * flip, applies the upgrade.
 *
 * Atomicity comes from the `status = 'pending'` predicate inside the UPDATE.
 * The unique constraint on `payment_transactions.order_id` makes the order id a
 * stable key, and the row lock the UPDATE takes is the serialisation point, so
 * of two concurrent verifications exactly one matches a row and the other gets
 * zero rows back. That is what stops a replayed webhook from crediting twice.
 *
 * A read-then-write -- read the row, branch on `status === "pending"`, then
 * update it -- is the shape this replaces, and it lets both callers through.
 *
 * `claimed: false` covers all three refusals: already paid, somebody else's
 * order, and an order id that does not exist. They are deliberately the same
 * answer, because a 403 for the second would confirm the id exists.
 */
export async function claimPaymentForUpgrade(
  input: { userId: string; orderId: string },
  client: DbClient = db,
): Promise<{ claimed: boolean; plan: string }> {
  const claimed = await client
    .update(paymentTransactions)
    .set({ status: "paid", updatedAt: new Date() })
    .where(
      and(
        eq(paymentTransactions.orderId, input.orderId),
        eq(paymentTransactions.userId, input.userId),
        eq(paymentTransactions.status, "pending"),
      ),
    )
    .returning({ id: paymentTransactions.id, plan: paymentTransactions.plan })

  const [row] = claimed
  if (!row) return { claimed: false, plan: "" }

  // Upgrade: set the plan and reset the lifetime counters. Upsert rather than
  // update-then-insert, so two upgrades cannot interleave into a missing row.
  await client
    .insert(userEntitlements)
    .values({ userId: input.userId, plan: row.plan, designmdUsed: 0, scrapeUsed: 0 })
    .onConflictDoUpdate({
      target: userEntitlements.userId,
      set: { plan: row.plan, designmdUsed: 0, scrapeUsed: 0, updatedAt: new Date() },
    })

  return { claimed: true, plan: row.plan }
}

export async function insertPaymentTransaction(
  input: { userId: string; orderId: string; plan: string; grossAmount: number },
  client: DbClient = db,
) {
  const [row] = await client
    .insert(paymentTransactions)
    .values({ ...input, status: "pending" })
    .returning()
  return row
}

const PAID = new Set(["settlement", "capture"])

/** Ordering for the upgrade-only rule. A plan not listed cannot be bought. */
const PLAN_RANK: Record<string, number> = { free: 0, starter: 1, pro: 2, proplus: 3 }

/**
 * Starts a Snap purchase.
 *
 * The price comes from the catalogue, never from the payload: a client that
 * could name the amount would be able to buy Pro+ for a rupiah. The plan is
 * also checked against the user's current rank, so the flow is upgrade-only --
 * a downgrade would have to refund, and there is no refund path.
 *
 * The transaction row is written *before* Snap is called, so an order that
 * Midtrans knows about always has a local record to be verified against.
 */
export const createPayment = createServerFn({ method: "POST" })
  .validator((input: { plan: string }) => {
    if (!input?.plan) throw new Error("plan is required")
    return input
  })
  .handler(
    async ({ data, context }): Promise<ActionResult<{ redirectUrl: string }>> => {
      const user = context.user
      if (!user) return failure("UNAUTHORIZED", "Masuk dengan Google dulu.")

      const { checkRateLimit } = await import("./rate-limit")
      const allowed = await checkRateLimit({
        key: `payment-create:${user.id}`,
        limit: 5,
        windowSeconds: 60,
      })
      if (!allowed) return failure("RATE_LIMITED", "Terlalu banyak percobaan.")

      const { readPlan } = await import("./plans")
      const target = await readPlan(data.plan)
      if (!target || target.price_idr <= 0) {
        return failure("INVALID_PLAN", "Paket tidak tersedia.")
      }

      const currentRank = PLAN_RANK[await currentPlanFor(user.id)] ?? 0
      const targetRank = PLAN_RANK[data.plan] ?? 0
      if (targetRank <= currentRank) {
        return failure(
          "DOWNGRADE_BLOCKED",
          "Upgrade ke paket yang lebih tinggi saja yang tersedia.",
        )
      }

      // Midtrans caps an order id at 50 characters, and this is well inside it.
      const orderId = `docrivo-${crypto.randomUUID()}`
      try {
        await insertPaymentTransaction({
          userId: user.id,
          orderId,
          plan: target.plan,
          grossAmount: target.price_idr,
        })
      } catch {
        return failure("PAYMENT_INIT_FAILED", "Gagal memulai pembayaran. Coba lagi.")
      }

      try {
        const redirectUrl = await createSnapTransaction({
          orderId,
          grossAmount: target.price_idr,
          plan: target.plan,
          userEmail: user.email,
        })
        return { ok: true, redirectUrl }
      } catch {
        // The row stays `pending`. That is the safe state: an unverified order
        // grants nothing, and the user can simply try again.
        return failure("PAYMENT_INIT_FAILED", "Gagal memulai pembayaran. Coba lagi.")
      }
    },
  )

/** The buyer's current plan, read for the upgrade-only check. */
async function currentPlanFor(userId: string): Promise<string> {
  const [row] = await db
    .select({ plan: userEntitlements.plan })
    .from(userEntitlements)
    .where(eq(userEntitlements.userId, userId))
    .limit(1)
  return row?.plan ?? "free"
}

/**
 * Poll-based verification. No webhook: Midtrans redirects back with
 * `?order_id=` and this checks the gateway, which is why the flow works on
 * localhost with no tunnel.
 */
export const verifyPayment = createServerFn({ method: "POST" })
  .validator((input: { orderId: string }) => {
    if (!input?.orderId) throw new Error("orderId is required")
    return input
  })
  .handler(
    async ({
      data,
      context,
    }): Promise<
      ActionResult<{ status: string; plan: string | null; transactionStatus: string }>
    > => {
      const user = context.user
      if (!user) return failure("UNAUTHORIZED", "Masuk dengan Google dulu.")

      // Blunts order-id enumeration and narrows the verify race window.
      const { checkRateLimit } = await import("./rate-limit")
      const allowed = await checkRateLimit({
        key: `verify:${user.id}`,
        limit: 10,
        windowSeconds: 60,
      })
      if (!allowed) return failure("RATE_LIMITED", "Terlalu banyak percobaan.")

      const [tx] = await db
        .select({
          plan: paymentTransactions.plan,
          status: paymentTransactions.status,
        })
        .from(paymentTransactions)
        .where(
          and(
            eq(paymentTransactions.orderId, data.orderId),
            eq(paymentTransactions.userId, user.id),
          ),
        )
        .limit(1)

      // Not found and not yours are the same answer.
      if (!tx) return failure("NOT_FOUND", "Transaksi tidak ditemukan.")

      // Already applied. Answering `paid` without touching the gateway is what
      // makes a second visit to `/pricing?order_id=...` harmless.
      if (tx.status === "paid") {
        return { ok: true, status: "paid", plan: tx.plan, transactionStatus: "settlement" }
      }

      let transactionStatus: string
      try {
        transactionStatus = await getTransactionStatus(data.orderId)
      } catch {
        return failure("VERIFY_FAILED", "Gagal memeriksa pembayaran. Muat ulang halaman.")
      }

      if (!PAID.has(transactionStatus)) {
        return { ok: true, status: transactionStatus, plan: null, transactionStatus }
      }

      const claim = await claimPaymentForUpgrade({ userId: user.id, orderId: data.orderId })
      return {
        ok: true,
        status: "paid",
        plan: claim.claimed ? claim.plan : tx.plan,
        transactionStatus,
      }
    },
  )
