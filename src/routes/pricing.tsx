import { createFileRoute } from "@tanstack/react-router"
export const Route = createFileRoute("/pricing")({
  // Optional keys: see the note in `index.tsx` on why a non-optional key here
  // would make `search` mandatory on every link to /pricing.
  validateSearch: (search: Record<string, unknown>): { order_id?: string } => {
    const order_id = typeof search.order_id === "string" ? search.order_id : undefined
    return order_id === undefined ? {} : { order_id }
  },
  loader: loadPricing,
  head: () => ({
    meta: [
      { title: "Pricing - Docrivo" },
      { name: "description", content: "Pilih paket Docrivo untuk menambah kredit generate dan scrape." },
    ],
  }),
  component: PricingPage,
})

import { SiteHeader } from "~/components/site-header";
import { SiteFooter } from "~/components/site-footer";
import { PricingCards } from "~/components/pricing-cards";
import { PaymentVerifier } from "~/components/payment-verifier";
import { listPlans } from "~/queries/plans";
import { getProfile } from "~/queries/profile";

type Plan = {
  plan: string;
  label: string;
  designmd_quota: number | null;
  scrape_quota: number | null;
  templates_unlocked: boolean;
  price_idr: number;
  sort_order: number;
};

/**
 * The catalogue comes from `public.list_plans()` through the `listPlans` server
 * function, and the current plan from the session -- neither from a constant.
 * The static fallback below is kept only for a signed-out visitor whose first
 * read fails, and it carries the same three paid plans the database seeds, so
 * the page still renders something buyable-shaped if the catalogue is
 * unreachable.
 */
async function loadPricing() {
  const [plans, user] = await Promise.all([
    listPlans({ data: undefined }).catch(() => [] as Plan[]),
    getProfile({ data: undefined }).catch(() => null),
  ])

  return {
    plans: plans.length > 0 ? plans : DEFAULT_PLANS,
    currentPlan: user ? await currentPlanOf(user.id) : "free",
  }
}

async function currentPlanOf(userId: string): Promise<string> {
  const { getEntitlement } = await import("~/queries/entitlements");
  return (await getEntitlement({ userId })).plan;
}

const DEFAULT_PLANS: Plan[] = [
  { plan: "free", label: "Free", designmd_quota: 3, scrape_quota: 5, templates_unlocked: false, price_idr: 0, sort_order: 0 },
  { plan: "starter", label: "Starter", designmd_quota: 10, scrape_quota: 20, templates_unlocked: true, price_idr: 49000, sort_order: 1 },
  { plan: "pro", label: "Pro", designmd_quota: null, scrape_quota: null, templates_unlocked: true, price_idr: 149000, sort_order: 2 },
];


export function PricingPage() {
  const { plans, currentPlan } = Route.useLoaderData()
  const { order_id } = Route.useSearch()

  return (
    <>
      <SiteHeader />
      <main id="main" className="min-h-[calc(100dvh-67px)] bg-paper-white">
        <section className="page-shell py-16 text-center">
          {order_id ? <PaymentVerifier key={order_id} orderId={order_id} /> : null}

          <span className="text-caption font-semibold uppercase tracking-[0.08em] text-muted-gray">Pricing</span>
          <h1 className="mt-3 text-heading font-semibold leading-heading tracking-heading">
            Tambah kredit, generate lebih <span className="emph">banyak</span>.
          </h1>
          <p className="mx-auto mt-4 max-w-lg text-body-sm leading-7 text-muted">
            Paket sekali beli. Kredit kamu di-reset saat upgrade.
          </p>

          <div className="mx-auto mt-10 max-w-4xl">
            <PricingCards plans={plans} currentPlan={currentPlan} />
          </div>
        </section>
      </main>
      <SiteFooter />
    </>
  );
}
