import type { Metadata } from "next";
import { SiteHeader } from "@/components/site-header";
import { SiteFooter } from "@/components/site-footer";
import { TemplateLock } from "@/components/template-lock";
import { requireUser } from "@/lib/dal";
import { getPlans, getEntitlement, templatesUnlocked } from "@/lib/plans";

export const metadata: Metadata = {
  title: "Template - Docrivo",
  description: "Template Docrivo akan segera tersedia.",
};

export default async function TemplatePage() {
  const user = await requireUser();
  const [plans, entitlement] = await Promise.all([getPlans(), getEntitlement(user.id)]);
  const unlocked = templatesUnlocked(entitlement, plans);

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
