import { createFileRoute } from "@tanstack/react-router"
import { SiteHeader } from "~/components/site-header"
import { SiteFooter } from "~/components/site-footer"

// TODO(Task 3.3): this route has NO recovery source. The pre-strip tree at
// 5e8a00c7d7b6287e0e0b0f2ad6519041df4f989a contains 14 `page.tsx` files and none
// of them is `maintenance`, but the route table in the plan lists `/maintenance`
// as public, which makes this the fifteenth route. The copy below is therefore a
// placeholder written to fill the route, not a port. Replace it with the real
// page when the source is identified, or delete the route if the plan's row was
// stale.
export const Route = createFileRoute("/maintenance")({
  head: () => ({
    meta: [
      { title: "Maintenance - Docrivo" },
      {
        name: "description",
        content: "Docrivo sedang dalam pemeliharaan singkat.",
      },
    ],
  }),
  component: MaintenancePage,
})

function MaintenancePage() {
  return (
    <>
      <SiteHeader />
      <main
        id="main"
        className="grid min-h-[calc(100dvh-67px)] place-items-center bg-paper-white px-4 py-16"
      >
        <section className="w-full max-w-md rounded-cards border border-ink bg-cream p-8 text-center shadow-hard-xl">
          <span className="text-caption font-semibold uppercase tracking-[0.08em] text-muted-gray">
            Maintenance
          </span>
          <h1 className="mt-3 text-heading font-semibold leading-heading tracking-heading">
            Sedang <span className="emph">dirawat</span>.
          </h1>
          <p className="mt-4 text-body-sm leading-7 text-muted">
            Docrivo sedang dalam pemeliharaan singkat. Coba lagi sebentar lagi.
          </p>
        </section>
      </main>
      <SiteFooter />
    </>
  )
}
