import { Link } from "@tanstack/react-router";

const PRODUCT = [
  ["Buat DESIGN.md", "/"],
  ["About", "/about"],
  ["Bantuan", "/bantuan"],
  ["FAQ", "/faq"],
];

const RESOURCE = [
  ["Cara kerja", "/bantuan"],
  ["Pertanyaan umum", "/faq"],
  ["Tentang Docrivo", "/about"],
];

export function SiteFooter() {
  return (
    <footer className="relative overflow-hidden border-t border-rule bg-cream">
      <div className="page-shell relative z-10 pt-20 pb-14">
        <div className="grid gap-12 md:grid-cols-[1.4fr_1fr_1fr]">
          <div className="max-w-sm">
            <span className="text-body font-semibold tracking-[-0.02em]">Docrivo</span>
            <p className="mt-4 text-body-sm leading-7 text-muted">
              Ubah website referensi jadi DESIGN.md yang bisa ditempel ke AI coding assistant biar hasil UI-nya konsisten.
            </p>
          </div>

          <FooterCol title="Produk" links={PRODUCT} />
          <FooterCol title="Sumber" links={RESOURCE} />
        </div>

        <div className="mt-16 flex flex-col gap-3 border-t border-rule pt-6 text-caption text-muted-gray sm:flex-row sm:items-center sm:justify-between">
          <span>© {new Date().getFullYear()} Docrivo. Dibuat untuk vibecoder.</span>
          <div className="flex gap-6">
            <Link to="/faq" className="link-underline">FAQ</Link>
            <Link to="/bantuan" className="link-underline">Bantuan</Link>
          </div>
        </div>
      </div>

      {/* Oversized wordmark watermark, echoing the reference footer. */}
      <span
        aria-hidden="true"
        className="pointer-events-none absolute -bottom-8 left-1/2 -translate-x-1/2 select-none text-[22vw] font-semibold leading-none tracking-[-0.04em] text-ink/[0.04]"
      >
        Docrivo
      </span>
    </footer>
  );
}

function FooterCol({ title, links }: { title: string; links: string[][] }) {
  return (
    <div>
      <h3 className="text-caption font-semibold uppercase tracking-[0.08em] text-muted-gray">{title}</h3>
      <ul className="mt-5 space-y-3 text-body-sm">
        {links.map(([label, href]) => (
          <li key={label + href}>
            <Link to={href} className="text-ink link-underline">{label}</Link>
          </li>
        ))}
      </ul>
    </div>
  );
}
