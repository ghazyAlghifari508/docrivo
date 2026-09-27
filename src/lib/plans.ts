import { cache } from "react";
import { insforge } from "./insforge";

export type Plan = {
  plan: string;
  label: string;
  designmd_quota: number | null;
  scrape_quota: number | null;
  templates_unlocked: boolean;
  price_idr: number;
  sort_order: number;
};

export type Entitlement = {
  user_id: string;
  plan: string;
  designmd_used: number;
  scrape_used: number;
};

export type QuotaKind = "designmd" | "scrape";

export const getPlans = cache(async (): Promise<Plan[]> => {
  return insforge.rpc<Plan[]>("list_plans");
});

/** Current user's entitlement. Returns a virtual free row if none exists yet
 *  (the row is created lazily on first quota consume). */
export async function getEntitlement(userId: string): Promise<Entitlement> {
  const rows = await insforge.rpc<Entitlement[]>("get_user_entitlement", { p_user: userId });
  const row = rows?.[0];
  return row ?? { user_id: userId, plan: "free", designmd_used: 0, scrape_used: 0 };
}

/** Remaining credits for a kind; null = unlimited. */
export function remainingFor(ent: Entitlement, plans: Plan[], kind: QuotaKind): number | null {
  const plan = plans.find((p) => p.plan === ent.plan);
  const quota = kind === "designmd" ? plan?.designmd_quota : plan?.scrape_quota;
  if (quota == null) return null;
  const used = kind === "designmd" ? ent.designmd_used : ent.scrape_used;
  return Math.max(0, quota - used);
}

export function templatesUnlocked(ent: Entitlement, plans: Plan[]): boolean {
  return plans.find((p) => p.plan === ent.plan)?.templates_unlocked ?? false;
}

export type QuotaResult = {
  allowed: boolean;
  plan: string;
  used: number;
  quota: number | null;
  remaining: number | null;
};

/** Atomically reserve one unit of quota. Server-side gate — call BEFORE doing
 *  any work. Returns allowed:false when the user is out of credits. */
export function consumeQuota(userId: string, kind: QuotaKind): Promise<QuotaResult> {
  return insforge.rpc<QuotaResult>("consume_quota", { p_user: userId, p_kind: kind });
}

/** Give back one unit (synchronous scrape failure only). */
export function refundQuota(userId: string, kind: QuotaKind): Promise<void> {
  return insforge.rpc<void>("refund_quota", { p_user: userId, p_kind: kind });
}
