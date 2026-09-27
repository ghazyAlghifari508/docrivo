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
  loader: loadHome,
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

import { listPlans } from "~/queries/plans"
import { getEntitlementFn } from "~/queries/entitlements"
import { getProfile } from "~/queries/profile"

/**
 * The signed-in visitor's plan and remaining credits, read through the
 * entitlement server functions. A signed-out visitor gets `null` from
 * `getProfile`, and the page then renders exactly the state the deleted version
 * rendered for one: no credit badge, and the generator in guest mode.
 *
 * Both reads are wrapped because this is the landing page -- a database blip on
 * `/` should not take the whole front door down with it.
 */
async function loadHome() {
  const user = await getProfile({ data: undefined }).catch(() => null)
  if (!user) return { authed: false, planLabel: "", remainingDesign: 0, remainingScrape: 0 }

  const [plans, entitlement] = await Promise.all([
    listPlans({ data: undefined }).catch(() => []),
    getEntitlementFn().catch(() => null),
  ])

  const label = plans.find((p) => p.plan === entitlement?.plan)?.label ?? ""
  return {
    authed: true,
    planLabel: label,
    remainingDesign: entitlement?.designmd.remaining ?? 0,
    remainingScrape: entitlement?.scrape.remaining ?? 0,
  }
}

function HomePage() {
  const { authed, planLabel, remainingDesign, remainingScrape } = Route.useLoaderData()

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
              {authed ? (
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
                authed={authed}
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
