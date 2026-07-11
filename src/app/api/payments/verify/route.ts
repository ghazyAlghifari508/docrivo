import { NextResponse } from "next/server";
import { z } from "zod";
import { getUser } from "@/lib/dal";
import { insforge } from "@/lib/insforge";
import { rateLimit } from "@/lib/rate-limit";
import { getTransactionStatus } from "@/lib/midtrans";

export const runtime = "nodejs";

const Body = z.object({ order_id: z.string().uuid() });

type Tx = { id: string; user_id: string; plan: string; status: string };

const PAID = new Set(["settlement", "capture"]);

export async function POST(req: Request) {
  try {
    const user = await getUser();
    if (!user) {
      return NextResponse.json({ error: { code: "UNAUTHORIZED" } }, { status: 401 });
    }

    // Rate-limit: blunts order_id enumeration and narrows the verify race window.
    if (!(await rateLimit(`verify:${user.id}`))) {
      return NextResponse.json({ error: { code: "RATE_LIMITED" } }, { status: 429 });
    }

    const { order_id } = Body.parse(await req.json());

    const tx = await insforge.maybeSingle<Tx>("payment_transactions", {
      order_id: `eq.${order_id}`,
      select: "id,user_id,plan,status",
    });
    if (!tx || tx.user_id !== user.id) {
      return NextResponse.json({ error: { code: "NOT_FOUND" } }, { status: 404 });
    }

    // Already applied — idempotent, don't re-reset usage counters.
    if (tx.status === "paid") {
      return NextResponse.json({ status: "paid", plan: tx.plan });
    }

    const status = await getTransactionStatus(order_id);
    if (!PAID.has(status)) {
      return NextResponse.json({ status, plan: null });
    }

    // Atomic claim: only ONE request can flip pending→paid. The match includes
    // status=pending, so a concurrent request that already flipped it returns
    // zero rows here and we short-circuit — prevents double-reset of counters.
    const claimed = await insforge.update<{ id: string }>(
      "payment_transactions",
      { order_id, status: "pending" },
      { status: "paid", updated_at: new Date().toISOString() },
      "id",
    );
    if (claimed.length === 0) {
      return NextResponse.json({ status: "paid", plan: tx.plan });
    }

    // Upgrade: set plan + reset lifetime usage counters to 0. Update first;
    // insert only if the user has no entitlement row yet.
    const updated = await insforge.update<{ user_id: string }>(
      "user_entitlements",
      { user_id: user.id },
      { plan: tx.plan, designmd_used: 0, scrape_used: 0, updated_at: new Date().toISOString() },
      "user_id",
    );
    if (updated.length === 0) {
      await insforge.insert(
        "user_entitlements",
        [{ user_id: user.id, plan: tx.plan, designmd_used: 0, scrape_used: 0 }],
        "user_id",
      );
    }

    return NextResponse.json({ status: "paid", plan: tx.plan });
  } catch (err) {
    if (err instanceof z.ZodError || err instanceof SyntaxError) {
      return NextResponse.json({ error: { code: "INVALID_REQUEST" } }, { status: 400 });
    }
    console.error("[api] payment verify failed", err);
    return NextResponse.json({ error: { code: "VERIFY_FAILED" } }, { status: 500 });
  }
}
