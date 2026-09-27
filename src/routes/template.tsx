import { createFileRoute } from "@tanstack/react-router"
export const Route = createFileRoute("/template")({
  // GATED. The deleted page called `requireUser()` from `src/lib/dal` (removed in
  // Task 3.1) and redirected to `/login`; this restores that.
  //
  // `beforeLoad` rather than the loader the Phase 3 stub used, so the guard fires
  // on an in-app navigation as well as on a full page load, and before the
  // entitlement read that decides whether the library is unlocked. The Phase 3
  // version rendered the locked state to everyone instead, which was the safe
  // direction but was not the behaviour: an unauthenticated visitor is turned
  // away, and a subscriber sees their library.
  //
  // The session is read from `context`, published once by the root route's
  // `beforeLoad`; nothing on this route resolves one.
  beforeLoad: ({ context, location }) => {
    requireSession(context, guardLocation(location))
  },
  loader: loadTemplate,
  head: () => ({
    meta: [
      { title: "Template - Docrivo" },
      { name: "description", content: "Template Docrivo akan segera tersedia." },
    ],
  }),
  component: TemplatePage,
})

import { SiteHeader } from "~/components/site-header";
import { SiteFooter } from "~/components/site-footer";
import { TemplateLock } from "~/components/template-lock";
import { guardLocation, requireSession } from "~/auth/guard";
import { listPlans } from "~/queries/plans";
import { getEntitlementFn } from "~/queries/entitlements";
import { getProfile } from "~/queries/profile";

/**
 * `templates_unlocked` on the user's own plan row, read through the entitlement
 * functions. A signed-out visitor, a failed read and a plan without the flag all
 * land on `false`, which is the locked state and the conservative one to render:
 * showing the library to someone who cannot pay for it is the worse failure of
 * the two.
 */
async function loadTemplate() {
  const user = await getProfile({ data: undefined }).catch(() => null)
  if (!user) return { unlocked: false }

  const [plans, entitlement] = await Promise.all([
    listPlans({ data: undefined }).catch(() => []),
    getEntitlementFn().catch(() => null),
  ])

  const unlocked =
    plans.find((p) => p.plan === entitlement?.plan)?.templates_unlocked ?? false
  return { unlocked }
}


export function TemplatePage() {
  const { unlocked } = Route.useLoaderData()

  return (
    <>
      <SiteHeader />
      <main id="main" className="relative min-h-[calc(100dvh-67px)] bg-paper-white">
        <section className={`page-shell py-16 ${unlocked ? "" : "pointer-events-none select-none blur-sm"}`}>
          <div className="rounded-cards border border-ink bg-cream p-8 text-center shadow-hard">
            <span className="text-caption font-semibold uppercase tracking-[0.08em] text-muted-gray">Template</span>
            <h1 className="mt-3 text-heading font-semibold leading-heading tracking-heading">
              Coming <span className="emph">soon</span>.
            </h1>
            <p className="mx-auto mt-4 max-w-lg text-body-sm leading-7 text-muted">
              Library template DESIGN.md belum tersedia. Untuk sekarang, generate dari referensi website dulu.
            </p>
          </div>
        </section>

        {unlocked ? null : <TemplateLock />}
      </main>
      <SiteFooter />
    </>
  );
}
