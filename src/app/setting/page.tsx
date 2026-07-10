import type { Metadata } from "next";
import { SiteHeader } from "@/components/site-header";
import { SiteFooter } from "@/components/site-footer";
import { requireUser } from "@/lib/dal";

export const metadata: Metadata = {
  title: "Setting - Docrivo",
  description: "Pengaturan akun Docrivo.",
};

export default async function SettingPage() {
  await requireUser();
  return (
    <>
      <SiteHeader />
      <main id="main" className="min-h-[calc(100dvh-67px)] bg-paper-white">
        <section className="page-shell py-16">
          <div className="rounded-cards border border-ink bg-cream p-8 text-center shadow-hard">
            <span className="text-caption font-semibold uppercase tracking-[0.08em] text-muted-gray">Setting</span>
            <h1 className="mt-3 text-heading font-semibold leading-heading tracking-heading">
              Coming <span className="emph">soon</span>.
            </h1>
            <p className="mx-auto mt-4 max-w-lg text-body-sm leading-7 text-muted">
              Pengaturan akun belum tersedia. Untuk saat ini login/logout sudah aktif.
            </p>
          </div>
        </section>
      </main>
      <SiteFooter />
    </>
  );
}
