import type { Metadata } from "next";
import { SiteHeader } from "@/components/site-header";
import { SiteFooter } from "@/components/site-footer";
import { HistoryList } from "@/components/history-list";

export const metadata: Metadata = {
  title: "History - Docrivo",
  description: "Riwayat scrape HTML dan generate DESIGN.md yang pernah kamu buat.",
};

export default function HistoryPage() {
  return (
    <>
      <SiteHeader />
      <main id="main" className="min-h-[calc(100dvh-67px)] bg-paper-white">
        <div className="page-shell py-14">
          <header className="mb-8">
            <span className="text-caption font-semibold uppercase tracking-[0.08em] text-muted-gray">Riwayat</span>
            <h1 className="mt-3 text-heading font-semibold leading-heading tracking-heading">
              History scrape &amp; generate
            </h1>
            <p className="mt-3 max-w-xl text-body-sm leading-7 text-muted">
              Semua website yang kamu scrape dan DESIGN.md yang kamu generate tersimpan di browser ini.
            </p>
          </header>
          <HistoryList />
        </div>
      </main>
      <SiteFooter />
    </>
  );
}
