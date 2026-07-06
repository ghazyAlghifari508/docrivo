import Link from "next/link";
import {
  ArrowRight,
  ShieldCheck,
  FileMd,
  Sparkle,
  Camera,
  ArrowClockwise,
  Plus,
  Minus,
  Quotes,
} from "@phosphor-icons/react/dist/ssr";
import { GenerationForm } from "@/components/generation-form";
import { TypingHeadline } from "@/components/typing-headline";
import { SiteHeader } from "@/components/site-header";
import { SiteFooter } from "@/components/site-footer";
import { Topographic } from "@/components/topographic";

const STATS = [
  ["3", "halaman", "cukup untuk melihat pola visual tanpa menunggu lama"],
  ["9", "sinyal gaya", "warna, gaya tulisan, layout, dan komponen diringkas rapi"],
  ["2", "hasil", "panduan desain dan arahan kerja siap dipakai"],
  ["1", "link", "mulai dari satu website referensi saja"],
];

const PIPELINE = [
  [
    "Cek link",
    "Kami pastikan link bisa dibaca sebelum proses dimulai.",
    ShieldCheck,
  ],
  [
    "Baca tampilan",
    "Docrivo melihat halaman, warna, tulisan, jarak, dan pola komponen penting.",
    Camera,
  ],
  [
    "Buat panduan",
    "Hasilnya diringkas jadi arahan desain yang mudah diikuti tim.",
    Sparkle,
  ],
];

const OUTPUTS = [
  [
    "Panduan desain",
    "Warna utama, gaya tulisan, layout, kartu, tombol, dan aturan visual penting.",
  ],
  [
    "Arahan kerja",
    "Instruksi praktis agar tim bisa membuat UI dengan rasa yang sama.",
  ],
  [
    "Bukti visual",
    "Ringkasan halaman yang dibaca supaya keputusan desain tetap punya dasar.",
  ],
  [
    "Ulangi mudah",
    "Kalau hasil belum pas, proses bisa dijalankan ulang dari referensi yang sama.",
  ],
];

const FIT = [
  [
    "Riset kompetitor",
    "Pahami rasa visual website lain sebelum mulai desain sendiri.",
    "01",
  ],
  [
    "Panduan gaya",
    "Satukan arahan visual untuk designer, builder, dan founder.",
    "02",
  ],
  [
    "Brief eksekusi",
    "Ubah inspirasi jadi instruksi kerja yang jelas dan tidak ngawang.",
    "03",
  ],
  [
    "Perbandingan UI",
    "Bandingkan gaya beberapa website tanpa menebak-nebak dari screenshot.",
    "04",
  ],
];

const FAQS = [
  [
    "Apakah desain website disalin?",
    "Tidak. Docrivo membaca pola visualnya, lalu membuat arahan baru untuk produkmu.",
  ],
  [
    "Berapa halaman yang dibaca?",
    "Beberapa halaman utama saja, supaya cepat dan tetap fokus pada gaya visual yang paling penting.",
  ],
  [
    "Kalau website gagal dibaca?",
    "Kamu akan melihat pesan yang jelas dan bisa mencoba lagi dari referensi yang sama.",
  ],
  [
    "Cocok untuk siapa?",
    "Founder, designer, dan builder yang butuh arahan visual sebelum membangun UI.",
  ],
];

export default function Home() {
  return (
    <>
      <SiteHeader />

      {/* 1 — HERO · paper white + lime halo */}
      <section className="relative overflow-hidden bg-paper-white">
        <div
          className="hero-halo pointer-events-none absolute inset-0"
          aria-hidden="true"
        />
        <div className="page-shell relative grid gap-14 pt-20 pb-24 lg:grid-cols-[1.05fr_.95fr] lg:items-center lg:pt-24 lg:pb-28">
          <div>
            <TypingHeadline />
            <p className="mt-6 max-w-xl text-body leading-body text-muted">
              Masukkan link website referensi. Docrivo membaca rasa visualnya, lalu
              merangkum warna, layout, dan gaya komponen menjadi panduan yang siap
              dipakai tim.
            </p>
            <div id="generate" className="mt-8 max-w-xl scroll-mt-24">
              <GenerationForm />
            </div>
            <p className="mt-6 flex flex-wrap items-center gap-x-6 gap-y-2 text-caption text-muted-gray">
              <span className="inline-flex items-center gap-2">
                <ShieldCheck
                  size={16}
                  weight="fill"
                  className="text-mint-edge"
                />{" "}
                Aman dibaca
              </span>
              <span className="inline-flex items-center gap-2">
                <FileMd size={16} weight="fill" className="text-mint-edge" />{" "}
                Panduan rapi
              </span>
              <span className="inline-flex items-center gap-2">
                <ArrowClockwise
                  size={16}
                  weight="fill"
                  className="text-mint-edge"
                />{" "}
                Bisa diulang
              </span>
            </p>
          </div>

          <DocPreview />
        </div>
      </section>

      {/* 2 — PROOF · cream band + stat tiles */}
      <section className="border-y border-rule bg-cream">
        <div className="page-shell py-20">
          <div className="flex flex-col gap-3 sm:flex-row sm:items-end sm:justify-between">
            <h2 className="max-w-md text-heading font-semibold leading-heading tracking-heading">
              Referensi singkat. Arah jelas. Panduan
              <span className="emph"> siap pakai</span>.
            </h2>
            <p className="max-w-xs text-body-sm leading-6 text-muted">
              Angka yang menjaga proses tetap cepat dan aman.
            </p>
          </div>
          <div className="mt-12 grid grid-cols-1 gap-px overflow-hidden rounded-cards border border-rule bg-rule sm:grid-cols-2 lg:grid-cols-4">
            {STATS.map(([num, unit, desc]) => (
              <div key={unit} className="bg-paper-white p-8">
                <span className="block text-heading-lg font-semibold leading-none tracking-heading-lg md:text-display md:tracking-display">
                  {num}
                </span>
                <p className="mt-5 max-w-[22ch] text-body-sm leading-6 text-muted">
                  {desc}
                </p>
                <p className="mt-4 text-caption font-medium uppercase tracking-[0.08em] text-muted-gray">
                  {unit}
                </p>
              </div>
            ))}
          </div>
        </div>
      </section>

      {/* 3 — HOW · paper white + contour watermark */}
      <section id="how" className="relative overflow-hidden bg-paper-white">
        <Topographic />
        <div className="page-shell relative py-24">
          <div className="max-w-2xl">
            <span className="text-caption font-semibold uppercase tracking-[0.08em] text-muted-gray">
              Cara kerja
            </span>
            <h2 className="mt-4 text-heading-lg font-semibold leading-heading-lg tracking-heading-lg">
              Tiga langkah dari referensi ke<span className="emph"> panduan</span>.
            </h2>
          </div>
          <div className="mt-14 grid gap-4 md:grid-cols-3">
            {PIPELINE.map(([title, desc, Icon], i) => (
              <article
                key={title as string}
                className="rounded-cards border border-ink bg-cream p-7 shadow-hard"
              >
                <div className="flex items-center justify-between">
                  <span className="grid size-11 place-items-center rounded-buttons border border-ink bg-lime-sprint">
                    <Icon size={22} weight="regular" aria-hidden="true" />
                  </span>
                  <span className="text-caption font-semibold text-muted-gray">
                    0{i + 1}
                  </span>
                </div>
                <h3 className="mt-6 text-subheading font-semibold">
                  {title as string}
                </h3>
                <p className="mt-3 text-body-sm leading-7 text-muted">
                  {desc as string}
                </p>
              </article>
            ))}
          </div>

          <div className="mt-4 rounded-cards border border-mint-edge bg-mint-wash p-6 md:flex md:items-center md:gap-4">
            <ShieldCheck
              size={24}
              weight="fill"
              className="shrink-0 text-ink"
              aria-hidden="true"
            />
            <p className="mt-3 text-body-sm font-medium md:mt-0">
              Link dicek lebih dulu agar proses tetap aman dan hasilnya fokus pada
              tampilan yang bisa dilihat pengguna.
            </p>
          </div>
        </div>
      </section>

      {/* 4 — OUTPUT · dark depth + contour */}
      <section
        id="output"
        className="relative overflow-hidden bg-depth text-paper-white"
      >
        <Topographic tone="paper" />
        <div className="page-shell relative py-24">
          <div className="grid gap-14 lg:grid-cols-[.9fr_1.1fr] lg:items-center">
            <div>
              <span className="text-caption font-semibold uppercase tracking-[0.08em] text-paper-white/50">
                Hasil
              </span>
              <h2 className="mt-4 text-heading-lg font-semibold leading-heading-lg tracking-heading-lg">
                Bukan screenshot cantik. Ini
                <span className="emph"> panduan</span> kerja.
              </h2>
              <p className="mt-6 max-w-md text-body leading-body text-paper-white/70">
                Setiap proses menghasilkan panduan desain dan arahan kerja yang
                cukup jelas untuk mulai membuat UI tanpa menebak-nebak.
              </p>
              <Link
                href="/#generate"
                className="pressable pressable-white mt-8 inline-flex h-12 items-center gap-2 rounded-buttons border border-paper-white bg-lime-sprint px-5 text-body-sm font-medium text-ink shadow-hard-white"
              >
                Buat panduan
                <ArrowRight size={18} weight="bold" aria-hidden="true" />
              </Link>
            </div>

            <div className="grid gap-4 sm:grid-cols-2">
              {OUTPUTS.map(([title, desc], i) => (
                <article
                  key={title}
                  className={`rounded-cards border p-6 ${
                    i === 0
                      ? "border-ink bg-lime-sprint text-ink sm:row-span-2 sm:flex sm:flex-col sm:justify-between"
                      : "border-paper-white/15 bg-paper-white/5"
                  }`}
                >
                  <h3
                    className={`text-subheading font-semibold ${i === 0 ? "" : "text-paper-white"}`}
                  >
                    {title}
                  </h3>
                  <p
                    className={`mt-3 text-body-sm leading-7 ${i === 0 ? "text-ink/80" : "text-paper-white/70"}`}
                  >
                    {desc}
                  </p>
                </article>
              ))}
            </div>
          </div>
        </div>
      </section>

      {/* 5 — FIT · paper white + contour watermark */}
      <section id="fit" className="relative overflow-hidden bg-paper-white">
        <Topographic />
        <div className="page-shell relative py-24">
          <div className="grid gap-14 lg:grid-cols-[.85fr_1.15fr] lg:items-start">
            <div className="lg:sticky lg:top-24">
              <span className="text-caption font-semibold uppercase tracking-[0.08em] text-muted-gray">
                Untuk siapa
              </span>
              <h2 className="mt-4 text-heading-lg font-semibold leading-heading-lg tracking-heading-lg">
                Dibuat untuk builder yang butuh
                <span className="emph"> arah</span>.
              </h2>
              <p className="mt-6 max-w-sm text-body leading-body text-muted">
                Bukan moodboard kosong — Docrivo memberi dokumen yang bisa
                langsung dipakai tim.
              </p>
            </div>

            <div className="grid gap-4 sm:grid-cols-2">
              {FIT.map(([title, desc, n]) => (
                <article
                  key={n}
                  className="rounded-cards border border-ink bg-cream p-7 shadow-hard"
                >
                  <span className="text-caption font-semibold text-muted-gray">
                    {n}
                  </span>
                  <h3 className="mt-4 text-subheading font-semibold">
                    {title}
                  </h3>
                  <p className="mt-3 text-body-sm leading-7 text-muted">
                    {desc}
                  </p>
                </article>
              ))}
            </div>
          </div>
        </div>
      </section>

      {/* 7 — FAQ + CTA · cream */}
      <section id="faq" className="bg-cream">
        <div className="page-shell grid gap-14 py-24 lg:grid-cols-[.8fr_1.2fr]">
          <div className="lg:sticky lg:top-24 lg:self-start">
            <span className="text-caption font-semibold uppercase tracking-[0.08em] text-muted-gray">
              FAQ
            </span>
            <h2 className="mt-4 text-heading-lg font-semibold leading-heading-lg tracking-heading-lg">
              Mulai dari <span className="emph">satu</span> link.
            </h2>
            <p className="mt-5 max-w-sm text-body-sm leading-7 text-muted">
              Pertanyaan yang paling sering muncul sebelum membuat panduan pertama.
            </p>
            <Link
              href="/#generate"
              className="pressable mt-8 inline-flex h-12 items-center gap-2 rounded-buttons border border-ink bg-lime-sprint px-5 text-body-sm font-medium text-ink shadow-hard"
            >
              Buat panduan
              <ArrowRight size={18} weight="bold" aria-hidden="true" />
            </Link>
          </div>

          <div className="divide-y divide-rule overflow-hidden rounded-cards border border-ink bg-paper-white shadow-hard">
            {FAQS.map(([q, a]) => (
              <details key={q} className="group p-6 [&_summary]:list-none">
                <summary className="flex cursor-pointer items-center justify-between gap-4 text-body-sm font-semibold">
                  {q}
                  <span className="grid size-7 shrink-0 place-items-center rounded-buttons border border-ink">
                    <Plus
                      size={15}
                      weight="bold"
                      className="group-open:hidden"
                      aria-hidden="true"
                    />
                    <Minus
                      size={15}
                      weight="bold"
                      className="hidden group-open:block"
                      aria-hidden="true"
                    />
                  </span>
                </summary>
                <p className="mt-3 max-w-xl text-body-sm leading-7 text-muted">
                  {a}
                </p>
              </details>
            ))}
          </div>
        </div>
      </section>

      <SiteFooter />
    </>
  );
}

/* Floating DESIGN.md preview card — the product-UI-as-hero pattern from docs/DESIGN.md. */
function DocPreview() {
  return (
    <div className="relative">
      <div className="relative overflow-hidden rounded-cards border border-ink bg-cream shadow-hard-lg">
        <div className="flex items-center gap-2 border-b border-ink bg-paper-white px-5 py-3.5">
          <span className="size-2.5 rounded-full border border-ink bg-lime-sprint" />
          <span className="size-2.5 rounded-full border border-ink bg-cream" />
          <span className="size-2.5 rounded-full border border-ink bg-cream" />
          <span className="ml-2 text-caption text-muted-gray">Panduan gaya</span>
        </div>
        <div className="grid md:grid-cols-[1fr_1.1fr]">
          <div className="border-b border-rule p-5 md:border-b-0 md:border-r">
            <p className="text-heading-sm font-semibold tracking-heading-sm">
              # Gaya utama
            </p>
            <p className="mt-3 text-body-sm leading-6 text-muted">
              Warna, tulisan, ruang, dan pola komponen.
            </p>
            <div className="mt-6 grid grid-cols-4 gap-2">
              {["bg-ink", "bg-lime-sprint", "bg-cream", "bg-mint-wash"].map(
                (c) => (
                  <span
                    key={c}
                    className={`h-11 rounded-buttons border border-ink ${c}`}
                  />
                ),
              )}
            </div>
            <div className="mt-6 space-y-2">
              <div className="h-2.5 w-4/5 rounded-pills bg-ink/15" />
              <div className="h-2.5 w-3/5 rounded-pills bg-ink/10" />
            </div>
          </div>
          <div className="relative overflow-hidden bg-depth p-5 text-paper-white">
            <Topographic tone="paper" />
            <div className="relative">
              <p className="text-caption text-paper-white/60">
                Arahan kerja
              </p>
              <p className="mt-4 text-subheading font-semibold leading-snug">
                Buat UI baru dengan rasa visual yang konsisten.
              </p>
              <div className="mt-6 space-y-2.5 text-body-sm text-paper-white/85">
                <p className="border-l-2 border-lime-sprint pl-3">
                  Jaga warna utama tetap fokus.
                </p>
                <p className="border-l-2 border-paper-white/25 pl-3">
                  Ikuti pola tombol, kartu, dan jarak.
                </p>
                <p className="border-l-2 border-paper-white/25 pl-3">
                  Buat halaman terasa konsisten.
                </p>
              </div>
            </div>
          </div>
        </div>
      </div>

      {/* small floating source chip, overlapping the card */}
      <div className="absolute -bottom-5 -left-5 hidden items-center gap-2 rounded-pills border border-ink bg-paper-white px-3 py-2 text-caption font-medium shadow-hard sm:flex">
        <span className="size-2 rounded-full bg-mint-edge" />
        gaya terbaca jelas
      </div>
    </div>
  );
}
