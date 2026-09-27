import { createFileRoute } from "@tanstack/react-router"
export const Route = createFileRoute("/faq")({
  head: () => ({
    meta: [
      { title: "FAQ - Docrivo" },
      { name: "description", content: "Pertanyaan tentang DESIGN.md, AI coding assistant, keamanan link, dan cara memakai Docrivo." },
    ],
  }),
  component: FaqPage,
})

import { Link } from "@tanstack/react-router";
import { ArrowRight } from "@phosphor-icons/react";
import { SiteHeader } from "~/components/site-header";
import { SiteFooter } from "~/components/site-footer";
import { Reveal } from "~/components/reveal";
import { FaqGroups } from "~/components/faq-groups";


const GROUPS = [
  {
    label: "Dasar",
    items: [
      [
        "Apa itu Docrivo?",
        "Docrivo membaca gaya visual website - warna, typography, layout, komponen - lalu merangkumnya jadi DESIGN.md yang bisa ditempel ke AI coding assistant.",
      ],
      [
        "Apakah desain website disalin?",
        "Tidak. Docrivo membaca pola visualnya sebagai referensi, lalu menyusun arahan baru untuk produkmu. Tidak ada aset yang disalin atau dipasang ulang.",
      ],
      [
        "Untuk siapa Docrivo dibuat?",
        "Vibecoder, founder, dan builder yang ingin AI mengikuti style tertentu saat membuat UI, bukan menebak dari prompt pendek.",
      ],
    ],
  },
  {
    label: "Cara kerja",
    items: [
      [
        "Berapa halaman yang dibaca?",
        "Beberapa halaman utama saja, supaya prosesnya cepat dan tetap fokus pada gaya visual yang paling mewakili.",
      ],
      [
        "Berapa lama prosesnya?",
        "Umumnya beberapa menit, tergantung ukuran halaman. DESIGN.md muncul otomatis di home saat siap.",
      ],
      [
        "Kalau website gagal dibaca?",
        "Kamu akan melihat pesan yang jelas dan bisa mencoba lagi dari referensi yang sama tanpa mengetik ulang link.",
      ],
    ],
  },
  {
    label: "Keamanan",
    items: [
      [
        "Link seperti apa yang bisa dipakai?",
        "Hanya link publik yang bisa dibuka umum. Halaman yang butuh login, bersifat internal, atau lokal ditolak demi keamanan.",
      ],
      [
        "Apakah data saya aman?",
        "Docrivo hanya menyentuh link yang lolos pemeriksaan dan fokus pada tampilan yang terlihat pengguna. Tidak ada data sensitif yang diproses.",
      ],
    ],
  },
  {
    label: "Hasil",
    items: [
      [
        "Apa saja yang saya dapat?",
        "Sebuah DESIGN.md berisi token warna, typography, spacing, komponen, layout, do/don't, dan prompt guide untuk AI coding assistant.",
      ],
      [
        "Bisa disimpan atau dibagikan?",
        "Bisa. DESIGN.md dapat disalin atau diunduh, lalu ditempel ke Claude Code, Cursor, v0, Lovable, Bolt, atau tool lain.",
      ],
      [
        "Hasilnya kurang pas, gimana?",
        "Jalankan ulang dari referensi yang sama. Kamu juga bisa mencoba halaman referensi yang berbeda untuk sudut gaya yang lain.",
      ],
    ],
  },
];

export function FaqPage() {
  return (
    <>
      <SiteHeader />

      <main id="main">
        {/* HERO · paper + halo */}
        <section className="relative overflow-hidden bg-paper-white">
          <div
            className="hero-halo pointer-events-none absolute inset-0 opacity-70"
            aria-hidden="true"
          />
          <div className="page-shell relative py-24 lg:py-28">
            <Reveal className="max-w-3xl">
              <h1 className="mt-5 text-heading-lg font-semibold leading-heading-lg tracking-heading-lg md:text-display md:leading-display md:tracking-display">
                Pertanyaan yang sering <span className="emph">muncul</span>.
              </h1>
              <p className="mt-6 max-w-xl text-body leading-body text-muted">
                Dikelompokkan biar gampang dicari. Belum ketemu jawabannya?
                Halaman Bantuan punya workflow langkah demi langkah.
              </p>
            </Reveal>
          </div>
        </section>

        {/* GROUPS · cream */}
        <section className="border-t border-rule bg-cream">
          <div className="page-shell py-24">
            <FaqGroups groups={GROUPS} />
          </div>
        </section>

        {/* CTA · paper */}
        <section className="bg-paper-white">
          <div className="page-shell py-20">
            <Reveal className="flex flex-col items-start justify-between gap-6 rounded-cards border border-ink bg-cream p-10 shadow-hard md:flex-row md:items-center">
              <div>
                <h2 className="text-heading font-semibold leading-heading tracking-heading">
                  Masih bingung?
                </h2>
                <p className="mt-3 max-w-md text-body-sm leading-7 text-muted">
                  Baca workflow langkah demi langkah di halaman Bantuan, atau
                  langsung buat DESIGN.md sendiri.
                </p>
              </div>
              <div className="flex flex-wrap gap-3">
                <Link
                  to="/bantuan"
                  className="inline-flex h-12 items-center gap-2 rounded-buttons border border-ink bg-paper-white px-5 text-body-sm font-medium text-ink"
                >
                  Buka Bantuan
                </Link>
                <Link
                  to="/"
                  className="pressable inline-flex h-12 items-center gap-2 rounded-buttons border border-ink bg-lime-sprint px-5 text-body-sm font-medium text-ink shadow-hard"
                >
                  Buat DESIGN.md
                  <ArrowRight size={18} weight="bold" aria-hidden="true" />
                </Link>
              </div>
            </Reveal>
          </div>
        </section>
      </main>

      <SiteFooter />
    </>
  );
}
