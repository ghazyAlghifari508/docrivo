import { createFileRoute } from "@tanstack/react-router"
import { SiteHeader } from "~/components/site-header"
import { SiteFooter } from "~/components/site-footer"
import { ScrapeDetail } from "~/components/scrape-detail"

// The trailing underscore on `history_` is the TanStack convention for a route
// that shares a URL prefix with another route without nesting under it. The
// Next tree had `src/app/history/page.tsx` and
// `src/app/history/scrapes/[id]/page.tsx` as siblings, so `/history/scrapes/:id`
// must NOT render inside `/history`'s element -- otherwise the History page's
// own header and empty-state would wrap the scrape detail.
export const Route = createFileRoute("/history_/scrapes/$id")({
  // AUTH NOT ENFORCED. Same shape as `generations.$id.tsx`: the ownership check
  // belonged to the `GET /api/scrapes/:id` handler that Task 3.1 deleted, and
  // Task 4.2's `getScrape` restores it server-side.
  head: () => ({
    meta: [
      { title: "Scrape HTML - Docrivo" },
      {
        name: "description",
        content: "Detail preview dan code hasil scrape HTML Docrivo.",
      },
    ],
  }),
  component: ScrapeHistoryDetailPage,
})

function ScrapeHistoryDetailPage() {
  const { id } = Route.useParams()
  return (
    <>
      <SiteHeader />
      <ScrapeDetail id={id} />
      <SiteFooter />
    </>
  )
}
