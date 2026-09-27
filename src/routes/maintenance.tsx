import { createFileRoute } from "@tanstack/react-router"
import { Wrench } from "@phosphor-icons/react"
import { Topographic } from "~/components/topographic"

export const Route = createFileRoute("/maintenance")({
  head: () => ({
    meta: [{ title: "Docrivo - dalam perbaikan" }],
  }),
  component: MaintenancePage,
})

function MaintenancePage() {
  return (
    <>
      <Topographic />

      <main className="relative z-10 mx-auto flex min-h-dvh max-w-lg flex-col items-center justify-center px-6 text-center">
        <div className="mb-6 flex size-16 items-center justify-center rounded-full bg-lime-sprint/20">
          <Wrench size={32} className="text-lime-sprint" />
        </div>

        <h1 className="font-fraunces text-heading-sm italic leading-heading-sm tracking-heading-sm text-ink md:text-heading md:leading-heading md:tracking-heading">
          Docrivo
          <br />
          <span className="not-italic">dalam perbaikan</span>
        </h1>

        <p className="mt-4 text-body leading-body text-muted">
          Kami sedang menyiapkan sesuatu yang lebih baik.
          <br />
          Silakan kembali lagi nanti.
        </p>

        <p className="mt-12 text-caption leading-caption text-muted-gray">
          Docrivo &middot; kembali dalam waktu dekat
        </p>
      </main>
    </>
  )
}
