import { createFileRoute } from "@tanstack/react-router"
export const Route = createFileRoute("/about")({
  head: () => ({
    meta: [
      { title: "About - Docrivo" },
      { name: "description", content: "Kenapa Docrivo ada: mengubah website referensi jadi DESIGN.md untuk AI coding assistant." },
    ],
  }),
  component: AboutPage,
})

import { Link } from "@tanstack/react-router";
import { ArrowRight, LinkedinLogo } from "@phosphor-icons/react";
import { SiteHeader } from "~/components/site-header";
import { SiteFooter } from "~/components/site-footer";
import { Topographic } from "~/components/topographic";
import { Reveal } from "~/components/reveal";


const STATS = [
  ["2026", "DIMULAI", "dibangun untuk vibecoder"],
  ["1", "LINK", "cukup untuk bikin style brief"],
  ["1", "DESIGN.md", "siap ditempel ke AI coding"],
  ["0", "SALINAN", "pola dibaca, aset tidak dijiplak"],
];

const WHY = [
  ["Prompt pendek bikin AI nebak-nebak.", "Vibecoding cepat, tapi hasil UI sering melenceng karena AI tidak punya aturan visual yang konkret."],
  ["Screenshot saja tidak cukup untuk agent coding.", "AI butuh token warna, type scale, spacing, komponen, dan do/don't agar bisa mengikuti style tanpa banyak revisi."],
  ["Docrivo mengubah referensi jadi DESIGN.md.", "Satu link dibaca sebagai pola visual, lalu diringkas jadi brief yang bisa ditempel ke Claude Code, Cursor, v0, Lovable, Bolt, atau tool AI lain."],
];

const TEAM = [
  ["Prompt workflow", "Membuat alur satu link jadi instruksi visual yang mudah dipakai di AI coding assistant."],
  ["Design system", "Menjaga hasil tetap spesifik: token, komponen, layout, dan batasan style - bukan saran generik."],
];

const WORK = [
  ["01", "Ambil referensi", "Mulai dari website publik yang vibe-nya paling dekat dengan produk yang ingin kamu build."],
  ["02", "Ekstrak aturan", "Kami baca token, komponen, layout, imagery, spacing, dan pola interaksi yang terlihat."],
  ["03", "Jadikan DESIGN.md", "Hasilnya ditulis sebagai instruksi yang bisa dipahami AI coding assistant."],
  ["04", "Tempel ke agent", "Gunakan di Claude Code, Cursor, v0, Lovable, Bolt, atau workflow vibecoding lain."],
  ["05", "Iterasi cepat", "Kalau style berubah, generate ulang dari referensi baru tanpa menyusun brief dari nol."],
];

const PHOTOS = [
  "Diskusi struktur halaman",
  "Merapikan referensi style",
  "Membaca pola komponen",
  "Menulis DESIGN.md",
  "Menguji rasa halaman",
  "Menyatukan keputusan visual",
  "Membandingkan referensi",
  "Menjaga karakter produk",
  "Menyusun prompt visual",
  "Mengulas hasil",
];

export function AboutPage() {
  return (
    <>
      <SiteHeader />

      <main id="main">
      {/* HERO + STATS */}
      <section className="relative overflow-hidden bg-paper-white">
        <div className="hero-halo pointer-events-none absolute inset-0 opacity-80" aria-hidden="true" />
        <Topographic className="opacity-55" />
        <div className="page-shell relative py-24 text-center lg:py-28">
          <Reveal className="mx-auto max-w-4xl">
            <h1 className="text-heading-lg font-semibold leading-heading-lg tracking-heading-lg md:text-display md:leading-display md:tracking-display">
              Referensi bukan tujuan. DESIGN.md adalah <span className="emph">instruksi</span>.
            </h1>
            <p className="mx-auto mt-6 max-w-2xl text-body leading-body text-muted">
              Kami membantu vibecoder mengubah website referensi menjadi DESIGN.md yang jelas,
              rapi, dan siap ditempel ke AI coding assistant - tanpa menjiplak tampilannya.
            </p>
          </Reveal>

          <div className="mx-auto mt-16 grid max-w-5xl grid-cols-1 gap-px overflow-hidden rounded-cards border border-rule bg-rule sm:grid-cols-2 lg:grid-cols-4">
            {STATS.map(([num, label, desc], i) => (
              <Reveal key={label} delay={i * 70}>
                <div className="h-full bg-cream p-7 text-left">
                  <p className="text-heading-lg font-semibold leading-none tracking-heading-lg md:text-display md:tracking-display">{num}</p>
                  <p className="mt-5 text-caption font-semibold uppercase tracking-[0.08em] text-muted-gray">{label}</p>
                  <p className="mt-3 text-body-sm leading-6 text-muted">{desc}</p>
                </div>
              </Reveal>
            ))}
          </div>
        </div>
      </section>

      {/* WHY WE EXIST */}
      <section className="border-y border-rule bg-cream">
        <div className="page-shell py-24">
          <Reveal>
            <h2 className="text-heading-lg font-semibold leading-heading-lg tracking-heading-lg">
              Kenapa kami ada.
            </h2>
          </Reveal>
          <div className="mt-14 grid gap-8 lg:grid-cols-3">
            {WHY.map(([title, desc], i) => (
              <Reveal key={title} delay={i * 90}>
                <article>
                  <div className="photo-tile relative h-72 overflow-hidden rounded-cards border border-ink bg-paper-white shadow-hard">
                    <Topographic className="opacity-70" />
                    <span className="absolute left-6 top-6 rounded-pills border border-ink bg-lime-sprint px-3 py-1 text-caption font-semibold">0{i + 1}</span>
                  </div>
                  <h3 className="mt-6 text-subheading font-semibold leading-subheading">{title}</h3>
                  <p className="mt-3 text-body leading-7 text-ink">{desc}</p>
                </article>
              </Reveal>
            ))}
          </div>
        </div>
      </section>

      {/* TEAM */}
      <section className="bg-paper-white">
        <div className="page-shell py-24">
          <Reveal>
            <h2 className="text-heading-lg font-semibold leading-heading-lg tracking-heading-lg">
              Workflow di balik <span className="emph">Docrivo</span>.
            </h2>
          </Reveal>
          <div className="mt-14 grid gap-5 md:grid-cols-2">
            {TEAM.map(([role, desc], i) => (
              <Reveal key={role} delay={i * 90}>
                <article className="overflow-hidden rounded-cards border border-ink bg-cream shadow-hard">
                  <div className="photo-tile h-96 border-b border-ink" />
                  <div className="p-7">
                    <div className="flex items-start justify-between gap-4">
                      <div>
                        <h3 className="text-heading-sm font-semibold tracking-heading-sm">{role}</h3>
                        <p className="mt-2 text-caption font-semibold uppercase tracking-[0.08em] text-muted-gray">
                          Docrivo core
                        </p>
                      </div>
                      <span className="grid size-9 place-items-center rounded-buttons border border-ink bg-paper-white" aria-hidden="true">
                        <LinkedinLogo size={18} weight="fill" />
                      </span>
                    </div>
                    <p className="mt-5 text-body-sm leading-7 text-muted">{desc}</p>
                  </div>
                </article>
              </Reveal>
            ))}
          </div>
        </div>
      </section>

      {/* STORY BEHIND THE NAME - editorial text block. */}
      <section className="bg-cream">
        <div className="page-shell grid gap-12 py-24 lg:grid-cols-[.72fr_1.28fr]">
          <Reveal>
            <span className="text-caption font-semibold uppercase tracking-[0.08em] text-muted-gray">Kenapa DESIGN.md</span>
            <h2 className="mt-4 text-heading-lg font-semibold leading-heading-lg tracking-heading-lg">
              Seperti prompt, tapi <span className="emph">terstruktur</span>.
            </h2>
          </Reveal>
          <Reveal delay={120}>
            <div className="space-y-5 text-body leading-body text-muted">
              <p>
                DESIGN.md adalah file briefing visual untuk AI: tempat warna, tipografi, spacing,
                komponen, layout, dan aturan style ditulis supaya agent coding tidak menebak.
              </p>
              <p>
                Docrivo menjembatani style reference dan vibecoding. Website yang kamu kagumi dibaca sebagai pola,
                lalu diubah menjadi instruksi yang bisa dipakai untuk membangun UI baru dengan style yang konsisten.
              </p>
              <p className="font-medium text-ink">
                Misi kami sederhana: bikin AI coding assistant lebih nurut ke style yang kamu mau, tanpa copy brand mentah.
              </p>
            </div>
          </Reveal>
        </div>
      </section>

      {/* HOW WE WORK */}
      <section className="bg-cream">
        <div className="page-shell py-24 lg:py-30">
          <Reveal>
            <h2 className="text-heading-lg font-semibold leading-heading-lg tracking-heading-lg">
              Cara kami <span className="emph">bekerja</span>.
            </h2>
          </Reveal>
          <div className="mt-12 grid gap-4 lg:grid-cols-5">
            {WORK.map(([n, title, desc], i) => (
              <Reveal key={n} delay={i * 60}>
                <article className="h-full rounded-xl border border-rule bg-paper-white p-5.5">
                  <p className="text-caption font-semibold text-muted-gray">{n}</p>
                  <h3 className="mt-8 text-body-sm font-semibold leading-6">{title}</h3>
                  <p className="mt-3 text-caption leading-6 text-muted">{desc}</p>
                </article>
              </Reveal>
            ))}
          </div>
        </div>
      </section>

      {/* HIRING / COLLAGE */}
      <section className="bg-cream pb-24 lg:pb-30">
        <div className="page-shell max-w-280">
          <div className="grid gap-3 lg:grid-cols-4 lg:grid-rows-[200px_200px_200px_200px]">
            <Reveal className="lg:col-start-1 lg:row-span-2 lg:row-start-1">
              <PhotoTile label={PHOTOS[0]} className="h-full min-h-103" />
            </Reveal>
            <Reveal delay={60} className="lg:col-span-2 lg:col-start-2 lg:row-start-1">
              <PhotoTile label={PHOTOS[1]} className="h-50" />
            </Reveal>
            <Reveal delay={120} className="lg:col-start-4 lg:row-start-1">
              <PhotoTile label={PHOTOS[2]} className="h-50" />
            </Reveal>
            <Reveal delay={180} className="lg:col-start-1 lg:row-start-3">
              <PhotoTile label={PHOTOS[3]} className="h-50" />
            </Reveal>
            <Reveal delay={240} className="lg:col-span-2 lg:col-start-2 lg:row-span-2 lg:row-start-2">
              <article className="flex h-full min-h-103 flex-col justify-center rounded-[14px] border border-rule bg-paper-white p-8">
                <div className="flex items-center gap-3 text-caption font-semibold uppercase tracking-[0.08em] text-muted-gray">
                  <span className="h-px w-10 bg-rule" />
                  We&apos;re hiring
                </div>
                <h2 className="mt-5 text-heading font-semibold leading-heading tracking-heading">
                  Building cleaner vibe-coding workflows with reusable <span className="emph">DESIGN.md</span>.
                </h2>
                <p className="mt-5 max-w-xl text-body-sm leading-7 text-muted">
                  Prompt nerds, UI tinkerers, dan product builders. Kalau kamu peduli AI output yang rapi,
                  kami ingin ngobrol.
                </p>
                <div className="mt-7 flex flex-wrap gap-3">
                  <Link to="/" className="pressable inline-flex h-11 items-center gap-2 rounded-buttons border border-ink bg-lime-sprint px-5 text-body-sm font-medium text-ink shadow-hard">
                    Buat DESIGN.md
                    <ArrowRight size={16} weight="bold" aria-hidden="true" />
                  </Link>
                  <Link to="/bantuan" className="inline-flex h-11 items-center rounded-buttons border border-rule bg-paper-white px-5 text-body-sm font-medium text-ink">
                    Hubungi kami
                  </Link>
                </div>
              </article>
            </Reveal>
            <Reveal delay={300} className="lg:col-start-4 lg:row-span-2 lg:row-start-2">
              <PhotoTile label={PHOTOS[4]} className="h-full min-h-103" />
            </Reveal>
            <Reveal delay={360} className="lg:col-start-1 lg:row-start-4">
              <PhotoTile label={PHOTOS[5]} className="h-50" />
            </Reveal>
            <Reveal delay={420} className="lg:col-start-2 lg:row-start-4">
              <PhotoTile label={PHOTOS[6]} className="h-50" />
            </Reveal>
            <Reveal delay={480} className="lg:col-start-3 lg:row-start-4">
              <PhotoTile label={PHOTOS[7]} className="h-50" />
            </Reveal>
            <Reveal delay={540} className="lg:col-start-4 lg:row-start-4">
              <PhotoTile label={PHOTOS[8]} className="h-50" />
            </Reveal>
          </div>
        </div>
      </section>

      {/* FINAL CTA */}
      <section className="relative overflow-hidden bg-depth text-paper-white">
        <Topographic tone="paper" />
        <div className="page-shell relative py-24 text-center">
          <Reveal className="mx-auto max-w-3xl">
            <h2 className="text-heading-lg font-semibold leading-heading-lg tracking-heading-lg">
              Mau AI bikin UI sesuai style? <span className="emph">Mulai di sini</span>.
            </h2>
            <p className="mx-auto mt-5 max-w-xl text-body-sm leading-7 text-paper-white/70">
              Tempel satu website, lalu ubah vibe-nya jadi DESIGN.md untuk agent coding.
            </p>
            <Link to="/" className="pressable pressable-white mt-8 inline-flex h-12 items-center gap-2 rounded-buttons border border-paper-white bg-lime-sprint px-6 text-body-sm font-medium text-ink shadow-hard-white">
              Buat DESIGN.md
              <ArrowRight size={18} weight="bold" aria-hidden="true" />
            </Link>
          </Reveal>
        </div>
      </section>
      </main>

      <SiteFooter />
    </>
  );
}

function PhotoTile({ label, className = "min-h-56" }: { label: string; className?: string }) {
  return (
    <div className={`photo-tile relative overflow-hidden rounded-[10px] border border-rule bg-paper-white ${className}`}>
      <Topographic className="opacity-50" />
      <div className="absolute inset-x-0 bottom-0 border-t border-ink bg-paper-white/90 px-4 py-3 text-caption font-medium text-muted">
        {label}
      </div>
    </div>
  );
}
