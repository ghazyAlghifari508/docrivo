import {
  ShieldCheck,
  FileMd,
  ArrowClockwise,
} from "@phosphor-icons/react/dist/ssr";
import { HomeGenerator } from "@/components/home-generator";
import { TypingHeadline } from "@/components/typing-headline";
import { SiteHeader } from "@/components/site-header";
import { SiteFooter } from "@/components/site-footer";
import { Topographic } from "@/components/topographic";
import { Reveal } from "@/components/reveal";

const CHIPS = [
  ["AI lebih nurut", ShieldCheck],
  ["DESIGN.md rapi", FileMd],
  ["Bisa dipakai ulang", ArrowClockwise],
] as const;

export default function Home() {
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
              <HomeGenerator />
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
  );
}
