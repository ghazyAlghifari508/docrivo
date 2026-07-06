import Link from "next/link";
import { ArrowRight } from "@phosphor-icons/react/dist/ssr";

const NAV = [
  ["Cara kerja", "/#how"],
  ["Hasil", "/#output"],
  ["Untuk siapa", "/#fit"],
  ["FAQ", "/#faq"],
];

export function SiteHeader({ surface = "paper" }: { surface?: "paper" | "cream" | "depth" }) {
  const dark = surface === "depth";
  const bg = dark ? "bg-depth text-paper-white" : surface === "cream" ? "bg-cream" : "bg-paper-white";
  const border = dark ? "border-paper-white/12" : "border-rule";

  return (
    <header className={`sticky top-0 z-40 border-b ${bg} ${border}`}>
      <div className="page-shell flex h-[67px] items-center justify-between gap-6">
        <Link href="/" className="flex shrink-0 items-center gap-2.5 text-body font-semibold tracking-[-0.02em]">
          <Wordmark dark={dark} />
          <span>Docrivo</span>
        </Link>

        <nav className={`hidden items-center gap-8 text-body-sm font-medium md:flex ${dark ? "text-paper-white/85" : "text-ink"}`}>
          {NAV.map(([label, href]) => (
            <Link key={href} href={href} className="link-underline">
              {label}
            </Link>
          ))}
        </nav>

        <div className="flex shrink-0 items-center gap-4">
          <Link
            href="/#generate"
            className="pressable inline-flex h-10 items-center gap-2 rounded-buttons border border-ink bg-lime-sprint px-4 text-body-sm font-medium text-ink shadow-hard"
          >
            Buat panduan
            <ArrowRight size={16} weight="bold" aria-hidden="true" />
          </Link>
        </div>
      </div>
    </header>
  );
}

function Wordmark({ dark }: { dark: boolean }) {
  return (
    <span
      className={`grid size-8 place-items-center rounded-buttons border bg-lime-sprint ${dark ? "border-paper-white" : "border-ink"}`}
      aria-hidden="true"
    >
      {/* Fish-mark nod to the reference brand, rendered as a clean vector glyph. */}
      <svg width="20" height="14" viewBox="0 0 20 14" fill="none" className="text-ink">
        <path
          d="M4 7C6.5 3 11 2.6 14 4C16.5 5 18 6.2 18.5 7C18 7.8 16.5 9 14 10C11 11.4 6.5 11 4 7Z"
          stroke="currentColor"
          strokeWidth="1.6"
          strokeLinejoin="round"
        />
        <path d="M4 7L1.5 4.2M4 7L1.5 9.8" stroke="currentColor" strokeWidth="1.6" strokeLinecap="round" strokeLinejoin="round" />
        <circle cx="14" cy="6.4" r="1" fill="currentColor" />
      </svg>
    </span>
  );
}
