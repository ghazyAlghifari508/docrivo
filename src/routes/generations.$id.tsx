import { createFileRoute } from "@tanstack/react-router"
import { RouteError, RouteNotFound } from "~/components/route-error"
import { SiteHeader } from "~/components/site-header"
import { SiteFooter } from "~/components/site-footer"
import { GenerationResult } from "~/components/generation-result"

export const Route = createFileRoute("/generations/$id")({
  // DELIBERATELY UNGUARDED, and this is a decision rather than a gap -- the two
  // read differently in the source on purpose.
  //
  // The Next page had no `requireUser()` of its own. Its ownership check lived in
  // the `GET /api/generations/:id` handler that `GenerationResult` polled, which
  // Task 3.1 deleted, and Task 4.1's `getOwnedJob` restores it server-side with
  // 404-not-403 semantics: a job owned by somebody else and a job that does not
  // exist take the same path and get the same answer.
  //
  // So a route-level `beforeLoad` guard would add nothing and cost something. It
  // would turn a stale or mistyped id into a redirect to /login -- for a signed-in
  // visitor who is perfectly authenticated, sent away from a page whose real
  // answer is "that job is not yours" -- and it would make the 404 the ownership
  // rule depends on unreachable from this page.
  //
  // `src/routes/__tests__/route-guards.test.ts` lists the guarded routes
  // explicitly, so adding a seventh guard is a visible edit to that table rather
  // than a silent divergence from it.
  //
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
