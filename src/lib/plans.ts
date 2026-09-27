/**
 * The plan catalogue's *shape* and the arithmetic on it.
 *
 * The data calls used to live here as InsForge RPCs. InsForge is gone, so they
 * moved to `src/queries/plans.ts` and `src/queries/entitlements.ts`, which reach
 * the same `public.list_plans()` and `public.get_user_entitlement()` functions
 * over Drizzle. What stayed is everything that is pure: the types, and the two
 * derivations that pages and components need.
 *
 * Split this way on purpose. A route component that imports a data module pulls
 * its database client into the browser bundle -- `src/routes/setting.tsx` had
 * already inlined copies of `remainingFor` and `templatesUnlocked` to avoid
 * exactly that. Keeping the arithmetic here and the I/O in `src/queries/` means
 * a component can import the arithmetic with nothing else attached.
 *
 * The column names stay snake_case because they are the `plans` table's.
 */
import { cache } from "react"

export type Plan = {
  plan: string
  label: string
  designmd_quota: number | null
  scrape_quota: number | null
  templates_unlocked: boolean
  price_idr: number
  sort_order: number
}

export type Entitlement = {
  user_id: string
  plan: string
  designmd_used: number
  scrape_used: number
}

export type QuotaKind = "designmd" | "scrape"

/** Remaining credits for a kind; null = unlimited. */
export function remainingFor(
  ent: Entitlement,
  plans: Plan[],
  kind: QuotaKind,
): number | null {
  const plan = plans.find((p) => p.plan === ent.plan)
  const quota = kind === "designmd" ? plan?.designmd_quota : plan?.scrape_quota
  if (quota == null) return null
  const used = kind === "designmd" ? ent.designmd_used : ent.scrape_used
  return Math.max(0, quota - used)
}

export function templatesUnlocked(ent: Entitlement, plans: Plan[]): boolean {
  return plans.find((p) => p.plan === ent.plan)?.templates_unlocked ?? false
}

/**
 * Re-exported rather than removed: three components imported `getPlans` from
 * here, and the TanStack Router plugin re-evaluates route modules on every
 * navigation, so this is the natural place for the per-render cache. The
 * catalogue is four rows of reference data that only change when a plan is
 * edited, so caching it for the life of a render pass costs nothing and saves a
 * round trip per component that asks.
 */
export const getPlans = cache(async (): Promise<Plan[]> => {
  const { listPlans } = await import("~/queries/plans")
  return listPlans({ data: undefined })
})
