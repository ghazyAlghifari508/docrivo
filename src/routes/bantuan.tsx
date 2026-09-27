import { createFileRoute } from "@tanstack/react-router"
export const Route = createFileRoute("/bantuan")({
  head: () => ({
    meta: [
      { title: "Bantuan - Docrivo" },
      { name: "description", content: "Workflow memakai Docrivo: dari link referensi sampai DESIGN.md siap ditempel ke AI coding assistant." },
    ],
  }),
  component: BantuanPage,
})

import { Link } from "@tanstack/react-router";
import { ArrowRight } from "@phosphor-icons/react";
import { SiteHeader } from "~/components/site-header";
import { SiteFooter } from "~/components/site-footer";
import { Topographic } from "~/components/topographic";
import { Reveal } from "~/components/reveal";


const METRICS = [
  ["1", "link referensi"],
  ["3", "menit untuk brief"],
  ["1", "DESIGN.md siap paste"],
  ["0", "aset disalin"],
];

const CASES = [
  {
    tone: "bg-mint-wash",
    large: true,
    title: "Dari referensi mentah ke DESIGN.md siap paste",
    desc: "Alur pertama untuk tahu link seperti apa yang cocok, apa yang dibaca, dan cara memakainya di tool vibecoding.",
    who: "Workflow utama",
    role: "Mulai dari satu link",
    media: true,
  },
  {
    tone: "bg-[#f7c8d9]",
    title: "Pilih referensi yang bisa diajarkan ke AI",
    desc: "Gunakan homepage atau landing page publik yang punya style jelas. Hindari login, dashboard internal, dan halaman kosong.",
    who: "Validasi link",
    role: "Sebelum generate",
    media: true,
  },
  {
    tone: "bg-cream",
    quote: "Fokus pada pola yang bikin AI nurut: warna, type scale, radius, spacing, tombol, kartu, section rhythm, dan do/don't.",
    who: "Baca hasil",
    role: "Saat DESIGN.md muncul",
  },
  {
    tone: "bg-lime-sprint/70",
    title: "Tempel hasil ke agent tanpa briefing panjang",
    desc: "DESIGN.md jadi konteks visual awal sebelum kamu minta AI bikin page, component, atau redesign.",
    who: "Vibecoding",
    role: "Untuk builder dan founder",
    media: true,
  },
  {
    tone: "bg-mint-wash",
    quote: "Pakai link publik. Jangan pakai halaman internal, dashboard private, atau halaman berisi data pribadi.",
    who: "Jaga tetap aman",
    role: "Sebelum menempel URL",
  },
  {
    tone: "bg-[#f7c8d9]",
    large: true,
    title: "Generate ulang saat vibe produk berubah",
    desc: "Kalau style kurang cocok, coba referensi lain. Docrivo dibuat supaya arah visual untuk AI bisa cepat diulang.",
    who: "Iterasi style",
    role: "Kapan pun arah bergeser",
    media: true,
  },
  {
    tone: "bg-cream",
    title: "FAQ untuk prompt dan hasil detail",
    desc: "Pertanyaan umum membantu saat hasil terasa kurang spesifik atau link tidak terbaca seperti yang diharapkan.",
    who: "Bantuan lanjutan",
    role: "Baca cepat",
    media: true,
  },
  {
    tone: "bg-lime-sprint/70",
    quote: "Tempel link, biarkan Docrivo membaca tampilan, lalu pakai DESIGN.md sebagai instruksi desain untuk AI coding assistant.",
    who: "Alur tercepat",
    role: "3 langkah utama",
  },
  {
    tone: "bg-mint-wash",
    title: "DESIGN.md tetap arahan, bukan salinan",
    desc: "Docrivo merangkum keputusan visual supaya produk baru punya style terarah tanpa menjiplak aset referensi.",
    who: "Prinsip pakai",
    role: "0 aset disalin",
    media: true,
  },
  {
    tone: "bg-[#f7c8d9]",
    quote: "Kalau masih ragu, mulai dari satu website yang paling mendekati UI yang ingin kamu minta AI bangun.",
    who: "Mulai sederhana",
    role: "Tidak perlu moodboard panjang",
  },
];

export function BantuanPage() {
  return (
    <>
      <SiteHeader />

      <main id="main">
        {/* HERO + FEATURED */}
        <section className="relative overflow-hidden bg-paper-white">
          <div className="hero-halo pointer-events-none absolute inset-0 opacity-60" aria-hidden="true" />
          <Topographic className="opacity-45" />
          <div className="page-shell relative py-24 lg:py-26">
            <Reveal className="max-w-3xl">
              <h1 className="text-heading-lg font-semibold leading-heading-lg tracking-heading-lg md:text-display md:leading-display md:tracking-display">
                Bantuan agar DESIGN.md kamu jadi <span className="emph">konteks AI</span>.
              </h1>
              <p className="mt-6 max-w-2xl text-body leading-body text-muted">
                Untuk vibecoder yang ingin AI mengikuti style tertentu: warna, layout,
                komponen, ritme, dan batasan visual yang jelas tanpa copy aset target.
              </p>
            </Reveal>

            <Reveal delay={120}>
              <Link
                to="/"
                className="group mt-12 block max-w-6xl overflow-hidden rounded-cards border border-rule bg-cream"
              >
                <div className="grid lg:grid-cols-[1.08fr_.92fr]">
                  <div className="bg-cream p-8 lg:p-10">
                    <div className="flex flex-wrap items-center gap-3 text-caption font-semibold uppercase tracking-[0.08em] text-muted-gray">
                      <span>Featured workflow</span>
                      <span className="rounded-pills border border-rule bg-paper-white px-3 py-1">AI design context</span>
                    </div>
                    <h2 className="mt-8 max-w-2xl text-heading-lg font-semibold leading-heading-lg tracking-heading-lg">
                      1 link jadi DESIGN.md yang bikin AI lebih nurut style.
                    </h2>
                    <p className="mt-5 max-w-xl text-body-sm leading-7 text-muted">
                      Mulai dari sini kalau baru pertama pakai Docrivo. Kamu akan tahu
                      referensi seperti apa yang cocok, apa yang dibaca, dan cara menempelnya ke agent coding.
                    </p>
                    <span className="mt-8 inline-flex items-center gap-2 text-body-sm font-semibold">
                      Mulai sekarang
                      <ArrowRight size={16} weight="bold" className="transition-transform group-hover:translate-x-1" aria-hidden="true" />
                    </span>
                  </div>

                  <div className="grid border-t border-rule bg-paper-white sm:grid-cols-2 lg:border-l lg:border-t-0">
                    {METRICS.map(([num, desc]) => (
                      <div key={desc} className="border-b border-r border-rule p-7 last:border-b-0 sm:even:border-r-0 sm:nth-last-[-n+2]:border-b-0">
                        <p className="text-heading-lg font-semibold leading-none tracking-heading-lg">{num}</p>
                        <p className="mt-4 text-body-sm leading-6 text-muted">{desc}</p>
                      </div>
                    ))}
                  </div>
                </div>
              </Link>
            </Reveal>
          </div>
        </section>

        {/* ALL STORIES */}
        <section className="bg-paper-white" id="stories">
          <div className="page-shell py-24">
            <Reveal>
              <span className="text-caption font-semibold uppercase tracking-[0.08em] text-muted-gray">Panduan vibecoding</span>
              <h2 className="mt-4 text-heading-lg font-semibold leading-heading-lg tracking-heading-lg">
                Cara memakai <span className="emph">DESIGN.md</span> di agent AI.
              </h2>
            </Reveal>

            <div className="mt-14 grid auto-rows-fr gap-5 lg:grid-cols-3">
              {CASES.map((card, i) => (
                <Reveal key={card.who} delay={i * 45} className={card.large ? "lg:col-span-2" : ""}>
                  <Link
                    to={card.who === "FAQ untuk kasus detail" ? "/faq" : "/"}
                    className={`group flex h-full min-h-126.75 flex-col overflow-hidden rounded-[20px] border border-rule ${card.tone}`}
                  >
                    {card.media && <div className="photo-tile h-52 border-b border-rule" />}
                    <div className="flex flex-1 flex-col p-7">
                      {card.quote ? (
                        <blockquote className="text-subheading font-semibold leading-subheading tracking-heading-sm">
                          “{card.quote}”
                        </blockquote>
                      ) : (
                        <>
                          <h3 className="text-heading-sm font-semibold leading-heading-sm tracking-heading-sm">{card.title}</h3>
                          <p className="mt-4 text-body-sm leading-7 text-muted">{card.desc}</p>
                        </>
                      )}
                      <span className="mt-6 inline-flex items-center gap-2 text-body-sm font-semibold">
                        Baca workflow
                        <ArrowRight size={16} weight="bold" className="transition-transform group-hover:translate-x-1" aria-hidden="true" />
                      </span>
                      <div className="mt-auto flex items-end justify-between gap-5 pt-10">
                        <div>
                          <p className="text-body-sm font-semibold">{card.who}</p>
                          <p className="mt-1 text-caption leading-5 text-muted">{card.role}</p>
                        </div>
                        <span className="rounded-pills border border-rule bg-paper-white/70 px-3 py-1 text-caption font-semibold text-muted-gray">
                          Docrivo
                        </span>
                      </div>
                    </div>
                  </Link>
                </Reveal>
              ))}
            </div>
          </div>
        </section>

        {/* CTA */}
        <section className="relative overflow-hidden bg-depth text-paper-white">
          <Topographic tone="paper" />
          <div className="page-shell relative py-24 text-center">
            <Reveal className="mx-auto max-w-3xl">
              <h2 className="text-heading-lg font-semibold leading-heading-lg tracking-heading-lg">
                Buat DESIGN.md yang bikin AI <span className="emph">paham style</span>.
              </h2>
              <p className="mx-auto mt-5 max-w-xl text-body-sm leading-7 text-paper-white/70">
                Tempel website publik. Docrivo membaca pola visualnya dan menulis DESIGN.md yang siap ditempel ke AI coding assistant.
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
