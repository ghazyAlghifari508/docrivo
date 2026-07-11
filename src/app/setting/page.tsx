import type { Metadata } from "next";
import Link from "next/link";
import { ArrowRight, CheckCircle, Clock, FileMd, GearSix, LockKey, SignOut, UserCircle } from "@phosphor-icons/react/dist/ssr";
import { CreditBadge } from "@/components/credit-badge";
import { SiteHeader } from "@/components/site-header";
import { SiteFooter } from "@/components/site-footer";
import { getGenerationHistory, getScrapeHistory, requireUser } from "@/lib/dal";
import { getPlans, getEntitlement, remainingFor, templatesUnlocked } from "@/lib/plans";
import { signOut } from "@/lib/auth-actions";

export const metadata: Metadata = {
  title: "Setting - Docrivo",
  description: "Pengaturan akun Docrivo.",
};

export default async function SettingPage() {
  const user = await requireUser();
  const [plans, entitlement, generations, scrapes] = await Promise.all([
    getPlans(),
    getEntitlement(user.id),
    getGenerationHistory(100),
    getScrapeHistory(100),
  ]);

  const plan = plans.find((p) => p.plan === entitlement.plan);
  const name = typeof user.profile?.name === "string" ? user.profile.name : "Pengguna Docrivo";
  const designRemaining = remainingFor(entitlement, plans, "designmd");
  const scrapeRemaining = remainingFor(entitlement, plans, "scrape");
  const templateOpen = templatesUnlocked(entitlement, plans);
  const latest = latestActivity(generations, scrapes);

  return (
    <>
      <SiteHeader />
      <main id="main" className="min-h-[calc(100dvh-67px)] bg-paper-white">
        <section className="page-shell py-14">
          <header className="mb-8">
            <span className="text-caption font-semibold uppercase tracking-[0.08em] text-muted-gray">Setting</span>
            <h1 className="mt-3 text-heading font-semibold leading-heading tracking-heading">
              Pengaturan akun <span className="emph">real</span>.
            </h1>
            <p className="mt-3 max-w-xl text-body-sm leading-7 text-muted">
              Semua angka diambil dari akun, paket, kredit, dan history kamu sekarang.
            </p>
          </header>

          <div className="grid gap-6 lg:grid-cols-[360px_minmax(0,1fr)]">
            <aside className="space-y-4">
              <section className="rounded-cards border border-ink bg-cream p-5 shadow-hard">
                <span className="grid size-12 place-items-center rounded-buttons border border-ink bg-lime-sprint shadow-hard">
                  <UserCircle size={25} weight="fill" aria-hidden="true" />
                </span>
                <h2 className="mt-4 text-title font-semibold text-ink">{name}</h2>
                <p className="mt-1 truncate text-body-sm text-muted">{user.email}</p>
                <p className="mt-3 break-all rounded-buttons border border-rule bg-paper-white px-3 py-2 text-caption text-muted-gray">
                  {user.id}
                </p>
                <Link href="/profile" className="pressable mt-5 inline-flex h-11 items-center gap-2 rounded-buttons border border-ink bg-paper-white px-4 text-body-sm font-medium text-ink shadow-hard">
                  Edit profile <ArrowRight size={15} weight="bold" aria-hidden="true" />
                </Link>
              </section>

              <section className="rounded-cards border border-ink bg-paper-white p-5 shadow-hard">
                <p className="text-caption font-semibold uppercase tracking-[0.08em] text-muted-gray">Sesi</p>
                <p className="mt-2 text-body-sm leading-7 text-muted">
                  Keluar akan menghapus sesi login di browser ini.
                </p>
                <form action={signOut} className="mt-4">
                  <button className="pressable inline-flex h-11 w-full items-center justify-center gap-2 rounded-buttons border border-ink bg-cream px-4 text-body-sm font-semibold text-ink shadow-hard">
                    <SignOut size={17} weight="fill" aria-hidden="true" /> Keluar
                  </button>
                </form>
              </section>
            </aside>

            <div className="space-y-6">
              <section className="rounded-cards border border-ink bg-paper-white p-6 shadow-hard-xl">
                <div className="flex flex-col gap-5 xl:flex-row xl:items-start xl:justify-between">
                  <div>
                    <span className="inline-flex items-center gap-2 text-caption font-semibold uppercase tracking-[0.08em] text-muted-gray">
                      <GearSix size={15} weight="fill" aria-hidden="true" /> Paket & kredit
                    </span>
                    <h2 className="mt-3 text-title font-semibold text-ink">Paket {plan?.label ?? "Free"}</h2>
                    <p className="mt-2 max-w-xl text-body-sm leading-7 text-muted">
                      Kredit dipakai langsung saat generate/scrape berhasil dimulai. Upgrade reset pemakaian paket.
                    </p>
                  </div>
                  <CreditBadge planLabel={plan?.label ?? "Free"} design={designRemaining} scrape={scrapeRemaining} />
                </div>

                <div className="mt-6 grid gap-4 sm:grid-cols-3">
                  <QuotaCard title="DESIGN.md" used={entitlement.designmd_used} quota={plan?.designmd_quota ?? null} />
                  <QuotaCard title="Scrape HTML" used={entitlement.scrape_used} quota={plan?.scrape_quota ?? null} />
                  <div className="rounded-cards border border-rule bg-cream p-4">
                    <p className="text-caption font-semibold uppercase tracking-[0.08em] text-muted-gray">Template</p>
                    <p className="mt-2 flex items-center gap-2 text-body-sm font-semibold text-ink">
                      {templateOpen ? <CheckCircle size={17} weight="fill" className="text-mint-edge" aria-hidden="true" /> : <LockKey size={17} weight="fill" aria-hidden="true" />}
                      {templateOpen ? "Terbuka" : "Terkunci"}
                    </p>
                    <p className="mt-2 text-caption leading-6 text-muted-gray">
                      {templateOpen ? "Akses Pro+ aktif." : "Butuh Pro+ untuk membuka template."}
                    </p>
                  </div>
                </div>

                <Link href="/pricing" className="pressable mt-6 inline-flex h-11 items-center gap-2 rounded-buttons border border-ink bg-lime-sprint px-5 text-body-sm font-semibold text-ink shadow-hard">
                  Kelola paket <ArrowRight size={15} weight="bold" aria-hidden="true" />
                </Link>
              </section>

              <section className="rounded-cards border border-ink bg-cream p-6 shadow-hard">
                <span className="inline-flex items-center gap-2 text-caption font-semibold uppercase tracking-[0.08em] text-muted-gray">
                  <Clock size={15} weight="fill" aria-hidden="true" /> Aktivitas
                </span>
                <div className="mt-5 grid gap-4 sm:grid-cols-3">
                  <Stat label="Generate" value={generations.length} helper="DESIGN.md tersimpan" />
                  <Stat label="Scrape" value={scrapes.length} helper="HTML tersimpan" />
                  <div className="rounded-cards border border-rule bg-paper-white p-4">
                    <p className="text-caption font-semibold uppercase tracking-[0.08em] text-muted-gray">Terakhir aktif</p>
                    <p className="mt-2 text-body-sm font-semibold text-ink">{latest ? formatDate(latest) : "Belum ada aktivitas"}</p>
                  </div>
                </div>
                <Link href="/history" className="pressable mt-6 inline-flex h-11 items-center gap-2 rounded-buttons border border-ink bg-paper-white px-5 text-body-sm font-semibold text-ink shadow-hard">
                  Lihat history <FileMd size={15} weight="fill" aria-hidden="true" />
                </Link>
              </section>
            </div>
          </div>
        </section>
      </main>
      <SiteFooter />
    </>
  );
}

function quotaLabel(quota: number | null) {
  return quota == null ? "Unlimited" : `${quota} total`;
}

function QuotaCard({ title, used, quota }: { title: string; used: number; quota: number | null }) {
  return (
    <div className="rounded-cards border border-rule bg-cream p-4">
      <p className="text-caption font-semibold uppercase tracking-[0.08em] text-muted-gray">{title}</p>
      <p className="mt-2 text-title font-semibold text-ink">{used} dipakai</p>
      <p className="mt-1 text-caption text-muted-gray">Kuota: {quotaLabel(quota)}</p>
    </div>
  );
}

function Stat({ label, value, helper }: { label: string; value: number; helper: string }) {
  return (
    <div className="rounded-cards border border-rule bg-paper-white p-4">
      <p className="text-caption font-semibold uppercase tracking-[0.08em] text-muted-gray">{label}</p>
      <p className="mt-2 text-title font-semibold text-ink">{value}</p>
      <p className="mt-1 text-caption text-muted-gray">{helper}</p>
    </div>
  );
}

function latestActivity(
  generations: { created_at: string }[],
  scrapes: { created_at: string }[],
): string | null {
  const latest = [...generations.map((g) => g.created_at), ...scrapes.map((s) => s.created_at)]
    .sort((a, b) => new Date(b).getTime() - new Date(a).getTime())[0];
  return latest ?? null;
}

function formatDate(value: string) {
  return new Intl.DateTimeFormat("id-ID", {
    dateStyle: "medium",
    timeStyle: "short",
  }).format(new Date(value));
}
