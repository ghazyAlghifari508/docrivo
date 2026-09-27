import { createFileRoute } from "@tanstack/react-router"
import {
  ShieldCheck,
  FileMd,
  ArrowClockwise,
} from "@phosphor-icons/react"
import { CreditBadge } from "~/components/credit-badge"
import { HomeGenerator } from "~/components/home-generator"
import { TypingHeadline } from "~/components/typing-headline"
import { SiteHeader } from "~/components/site-header"
import { SiteFooter } from "~/components/site-footer"
import { Topographic } from "~/components/topographic"
import { Reveal } from "~/components/reveal"

const CHIPS = [
  ["AI lebih nurut", ShieldCheck],
  ["DESIGN.md rapi", FileMd],
  ["Bisa dipakai ulang", ArrowClockwise],
] as const

export const Route = createFileRoute("/")({
  // Declared so `navigate({ to: "/", search: { url } })` in
  // `generation-result.tsx`'s Retry button type-checks against a known shape.
  // Next read this with `useSearchParams()`, which needed no declaration.
  //
  // The optional `url?` is load-bearing, not stylistic: TanStack makes the whole
  // `search` prop required on a `Link`/`navigate` whose target has a
  // `validateSearch` with any non-optional key, and a required key here would
  // force all fourteen links to `/` to spell out `search={{ url: undefined }}`.
  validateSearch: (search: Record<string, unknown>): { url?: string } => {
    const url = typeof search.url === "string" ? search.url : undefined
    return url === undefined ? {} : { url }
  },
  head: () => ({
    meta: [
      { title: "Docrivo - Website jadi DESIGN.md untuk AI coding" },
      {
        name: "description",
        content:
          "Ubah website referensi jadi DESIGN.md yang membuat AI coding assistant mengikuti style yang kamu mau.",
      },
    ],
  }),
  component: HomePage,
})

function HomePage() {
  // TODO(Task 4.3): resolve the real session user here -- the deleted version
  // awaited `getUser()` from `src/lib/dal`, which Task 3.1 removed. Until the
  // root loader lands (Task 7.3) this page always renders as a signed-out
  // visitor: no `CreditBadge`, and `HomeGenerator` in guest mode.
  const user = null

  // TODO(Task 4.3): `getPlans()` and `getEntitlement(user.id)` from
  // `src/lib/plans.ts` are InsForge RPCs, and Task 4.3 replaces them with the
  // `listPlans` / `getEntitlement` server functions. The zeros below are the
  // same values the deleted page used for a signed-out visitor.
  const planLabel = ""
  const remainingDesign: number | null = 0
  const remainingScrape: number | null = 0

  return (
    <>
      <SiteHeader />

      <main id="main">
        {/* Satu-satunya section - hero terpusat, fokus ke aksi. */}
        <section className="relative flex min-h-[calc(100dvh-67px)] items-center overflow-hidden bg-paper-white">
          <div className="hero-halo pointer-events-none absolute inset-0" aria-hidden="true" />
          <Topographic className="opacity-70" />

          <div className="page-shell relative w-full py-20 text-center">
            <Reveal className="mx-auto flex max-w-3xl flex-col items-center">
              {user ? (
                <div className="mb-6">
                  <CreditBadge planLabel={planLabel} design={remainingDesign} scrape={remainingScrape} />
                </div>
              ) : null}

              <div>
                <TypingHeadline />
              </div>

              <p className="mt-6 max-w-xl text-body leading-body text-muted">
                Tempel website yang vibe-nya kamu suka. Docrivo mengubah pola visualnya
                jadi DESIGN.md agar Cursor, Claude Code, v0, Lovable, atau Bolt bisa
                mengikuti style yang kamu mau - bukan menebak dari prompt pendek.
              </p>
            </Reveal>

            <Reveal delay={120} className="mx-auto mt-10 w-full">
              <HomeGenerator
                authed={!!user}
                remainingDesign={remainingDesign}
                remainingScrape={remainingScrape}
              />
            </Reveal>

            <Reveal delay={220} className="mx-auto mt-8 flex max-w-xl flex-wrap items-center justify-center gap-x-6 gap-y-2 text-caption text-muted-gray">
              {CHIPS.map(([label, Icon]) => (
                <span key={label} className="inline-flex items-center gap-2">
                  <Icon size={16} weight="fill" className="text-mint-edge" aria-hidden="true" />
                  {label}
                </span>
              ))}
            </Reveal>
          </div>
        </section>
      </main>

      <SiteFooter />
    </>
  )
}
