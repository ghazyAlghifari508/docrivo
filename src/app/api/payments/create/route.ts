import { NextResponse } from "next/server";
import { z } from "zod";
import { getUser } from "@/lib/dal";
import { rateLimit } from "@/lib/rate-limit";
import { getPlans, getEntitlement } from "@/lib/plans";
import { insforge } from "@/lib/insforge";
import { createSnapTransaction } from "@/lib/midtrans";

export const runtime = "nodejs";

const Body = z.object({ plan: z.enum(["starter", "pro", "proplus"]) });
const PLAN_RANK: Record<string, number> = { free: 0, starter: 1, pro: 2, proplus: 3 };

export async function POST(req: Request) {
  try {
    const user = await getUser();
    if (!user) {
      return NextResponse.json({ error: { code: "UNAUTHORIZED" } }, { status: 401 });
    }

    if (!(await rateLimit(`payment-create:${user.id}`))) {
      return NextResponse.json({ error: { code: "RATE_LIMITED" } }, { status: 429 });
    }

    const { plan } = Body.parse(await req.json());

    // Price comes from the DB, never from the client.
    const [plans, entitlement] = await Promise.all([getPlans(), getEntitlement(user.id)]);
    const target = plans.find((p) => p.plan === plan);
    if (!target || target.price_idr <= 0) {
      return NextResponse.json({ error: { code: "INVALID_PLAN" } }, { status: 400 });
    }

    // Block downgrade: user can only upgrade, not downgrade or buy same tier.
    const currentRank = PLAN_RANK[entitlement.plan] ?? 0;
    const targetRank = PLAN_RANK[plan] ?? 0;
    if (targetRank <= currentRank) {
      return NextResponse.json(
        { error: { code: "DOWNGRADE_BLOCKED", message: "Upgrade ke paket yang lebih tinggi saja yang tersedia." } },
        { status: 400 },
      );
    }

    const orderId = crypto.randomUUID();
    await insforge.insert("payment_transactions", [
      {
        user_id: user.id,
        order_id: orderId,
        plan,
        gross_amount: target.price_idr,
        status: "pending",
      },
    ], "id");

    const redirectUrl = await createSnapTransaction({
      orderId,
      grossAmount: target.price_idr,
      plan,
      userEmail: user.email,
    });

    return NextResponse.json({ redirectUrl });
  } catch (err) {
    if (err instanceof z.ZodError || err instanceof SyntaxError) {
      return NextResponse.json({ error: { code: "INVALID_PLAN" } }, { status: 400 });
    }
    console.error("[api] payment create failed", err);
    return NextResponse.json({ error: { code: "PAYMENT_INIT_FAILED" } }, { status: 500 });
  }
}
