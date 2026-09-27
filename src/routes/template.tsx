import { createFileRoute } from "@tanstack/react-router"
export const Route = createFileRoute("/template")({
  // AUTH NOT ENFORCED. The deleted page called `requireUser()` from
  // `src/lib/dal` (removed in Task 3.1) and redirected to /login. Task 7.3 adds
  // the root loader that resolves the session once per request; that is where
  // the `beforeLoad` guard belongs. Until then this route renders for anyone.
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

// TODO(Task 4.3): `templatesUnlocked(getEntitlement(user.id), getPlans())` came
// from `src/lib/plans.ts`, whose two data calls were InsForge RPCs. Task 4.3
// replaces them with the `getEntitlement` and `listPlans` server functions.
// Hard-coded to `false` meanwhile, which is the locked state -- the same state
// a free-plan visitor saw, and the conservative one to render for a user whose
// plan cannot be read yet.
const unlocked = false;


export function TemplatePage() {
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
