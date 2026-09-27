import { createFileRoute } from "@tanstack/react-router"
export const Route = createFileRoute("/history")({
  // GATED. `getGenerationHistory()` / `getScrapeHistory()` both called
  // `requireUser()` in `src/lib/dal` (removed in Task 3.1), which redirected to
  // /login before the list was ever built; this restores that.
  //
  // `beforeLoad` rather than the loader the Phase 3 stub used. The stub caught the
  // 401 and rendered an empty list, which is a page that renders for anyone -- and
  // an empty list is exactly what a user with no history sees, so the two are
  // indistinguishable on screen. The guard also fires on an in-app navigation,
  // which a loader-level 401 handler would not have covered without extra work.
  //
  // The session is read from `context`, published once by the root route's
  // `beforeLoad`. This route then calls two server functions, and neither of them
  // resolves a session of its own -- so the whole page is one lookup.
  beforeLoad: ({ context, location }) => {
    requireSession(context, guardLocation(location))
  },
  loader: loadHistory,
  // `loadHistory` re-throws anything that is not a 401, so a database timeout
  // reaches this boundary instead of being flattened into an empty list.
  errorComponent: RouteError,
  notFoundComponent: RouteNotFound,
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
import { RouteError, RouteNotFound } from "~/components/route-error";
import { guardLocation, requireSession } from "~/auth/guard";
import { listJobs } from "~/queries/jobs";
import { listScrapes } from "~/queries/scrapes";

/**
 * Both lists are read server-side and user-scoped, so no `userId` crosses the
 * wire and a caller cannot ask for somebody else's history by editing a
 * parameter. `listJobs` / `listScrapes` resolve the session themselves.
 */
async function loadHistory() {
  try {
    const [generations, scrapes] = await Promise.all([
      listJobs({ data: {} }),
      listScrapes({ data: {} }),
    ])
    return { generations, scrapes }
  } catch (error) {
    // A 401 is the documented state for a signed-out visitor until Task 7.3
    // adds the guard. Anything else is a real failure and belongs in the route's
    // error boundary rather than being flattened into an empty list.
    if (error instanceof Response && error.status === 401) {
      return { generations: [], scrapes: [] }
    }
    throw error
  }
}

export function HistoryPage() {
  const { generations, scrapes } = Route.useLoaderData()

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
              url: g.sourceUrl,
              status: g.status,
              at: new Date(g.createdAt).getTime(),
            }))}
            scrapes={scrapes.map((s) => ({
              id: s.id,
              url: s.sourceUrl,
              at: new Date(s.createdAt).getTime(),
            }))}
          />
        </div>
      </main>
      <SiteFooter />
    </>
  );
}
