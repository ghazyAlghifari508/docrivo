import { createServerFn } from "@tanstack/react-start"
import { sql } from "drizzle-orm"
import type { DbClient } from "~/db"
import { appDb } from "~/queries/app-db"

/**
 * The plan catalogue, as the row `public.list_plans()` returns: every column of
 * `plans`, ordered by `sort_order`. Column names stay snake_case because that is
 * what the pricing cards have always read -- `designmd_quota`, `price_idr` --
 * and renaming them would be a wire change for no gain.
 */
export type Plan = {
  plan: string
  label: string
  designmd_quota: number | null
  scrape_quota: number | null
  templates_unlocked: boolean
  price_idr: number
  sort_order: number
}

/**
 * Read through the RPC rather than `select * from plans`.
 *
 * `migrations/0007` defines `list_plans()` as `SECURITY DEFINER` precisely so a
 * server route handler can read the catalogue without a permissive select policy
 * for the connecting role. Replacing it with a plain select would reintroduce the
 * policy the function exists to avoid.
 */
export async function readPlanCatalogue(client: DbClient): Promise<Plan[]> {
  return client.execute<Plan>(sql`select * from public.list_plans()`)
}

/** One plan by name, or `null`. Used to price a purchase server-side. */
export async function readPlan(
  plan: string,
  client: DbClient,
): Promise<Plan | null> {
  const [row] = await client.execute<Plan>(
    sql`select * from public.list_plans() where plan = ${plan}`,
  )
  return row ?? null
}

export const listPlans = createServerFn({ method: "GET" })
  .handler(async (): Promise<Plan[]> => readPlanCatalogue(await appDb()))
