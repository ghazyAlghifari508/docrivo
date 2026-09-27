import { createFileRoute } from "@tanstack/react-router"
import { RouteError, RouteNotFound } from "~/components/route-error"
import { SiteHeader } from "~/components/site-header"
import { SiteFooter } from "~/components/site-footer"
import { GenerationResult } from "~/components/generation-result"

export const Route = createFileRoute("/generations/$id")({
  // AUTH NOT ENFORCED. The Next page had no `requireUser()` of its own -- the
  // ownership check lived in the `GET /api/generations/:id` handler that
  // `GenerationResult` polls, which Task 3.1 deleted. Task 4.1's `getOwnedJob`
  // restores that check server-side (404, not 403) and is the real gate; the
  // route itself is intentionally left unguarded so a stale id renders the
  // component's own not-found state rather than a redirect.
  // A missing id, a job whose row has gone, and a database timeout all land
  // here rather than in an unhandled rejection. The not-found half is the one
  // that matters most: `readOwnedJob` raises `notFound()` for a job owned by
  // somebody else and for one that does not exist alike, and this boundary must
  // not give the two different messages.
  errorComponent: RouteError,
  notFoundComponent: RouteNotFound,
  head: () => ({
    meta: [
      { title: "DESIGN.md - Docrivo" },
      {
        name: "description",
        content: "Hasil DESIGN.md dari website referensi kamu.",
      },
    ],
  }),
  component: GenerationPage,
})

function GenerationPage() {
  const { id } = Route.useParams()
  return (
    <>
      <SiteHeader />
      <GenerationResult id={id} />
      <SiteFooter />
    </>
  )
}
