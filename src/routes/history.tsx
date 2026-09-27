import { createFileRoute } from "@tanstack/react-router"
export const Route = createFileRoute("/history")({
  // AUTH NOT ENFORCED. `getGenerationHistory()` / `getScrapeHistory()` both
  // called `requireUser()` in `src/lib/dal` (removed in Task 3.1), which
  // redirected to /login before the list was ever built. Task 7.3 adds the root
  // loader; that is where the `beforeLoad` guard belongs. Until then this route
  // renders an empty list for anyone.
  head: () => ({
    meta: [
      { title: "History - Docrivo" },
      { name: "description", content: "Riwayat scrape HTML dan generate DESIGN.md yang pernah kamu buat." },
    ],
  }),
  component: HistoryPage,
})

import { SiteHeader } from "~/components/site-header";
import { SiteFooter } from "~/components/site-footer";
import { HistoryList } from "~/components/history-list";

// TODO(Task 4.1 / 4.2): these replace `getGenerationHistory()` and
// `getScrapeHistory()` from `src/lib/dal`, which were InsForge queries deleted
// in Task 3.1. Task 4.1 owns `listJobs`, Task 4.2 owns `listScrapes`, and both
// are user-scoped on the server so no client-supplied `userId` is needed.
type GenerationHistoryRow = { id: string; source_url: string; status: string; created_at: string };
type ScrapeHistoryRow = { id: string; source_url: string; created_at: string };
const generations: GenerationHistoryRow[] = [];
const scrapes: ScrapeHistoryRow[] = [];


export function HistoryPage() {
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
              Semua website yang kamu scrape dan DESIGN.md yang kamu generate tersimpan di akun Google kamu.
            </p>
          </header>
          <HistoryList
            generations={generations.map((g) => ({
              id: g.id,
              url: g.source_url,
              status: g.status,
              at: new Date(g.created_at).getTime(),
            }))}
            scrapes={scrapes.map((s) => ({
              id: s.id,
              url: s.source_url,
              at: new Date(s.created_at).getTime(),
            }))}
          />
        </div>
      </main>
      <SiteFooter />
    </>
  );
}
