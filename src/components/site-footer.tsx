import Link from "next/link";

const PRODUCT = [
  ["Cara kerja", "/#how"],
  ["Hasil", "/#output"],
  ["Untuk siapa", "/#fit"],
  ["FAQ", "/#faq"],
  ["Buat panduan", "/#generate"],
];

const RESOURCE = [
  ["Panduan desain", "/#output"],
  ["Cara kerja", "/#how"],
  ["Mulai sekarang", "/#generate"],
];

export function SiteFooter() {
  return (
    <footer className="relative overflow-hidden border-t border-rule bg-cream">
      <div className="page-shell relative z-10 pt-20 pb-14">
        <div className="grid gap-12 md:grid-cols-[1.4fr_1fr_1fr]">
          <div className="max-w-sm">
            <span className="text-body font-semibold tracking-[-0.02em]">Docrivo</span>
            <p className="mt-4 text-body-sm leading-7 text-muted">
              Ubah website referensi jadi panduan desain yang jelas, rapi, dan mudah dipakai tim.
            </p>
            <span className="mt-6 inline-flex items-center gap-2 rounded-pills border border-mint-edge bg-mint-wash px-3 py-1.5 text-caption font-medium text-ink">
              <span className="size-2 rounded-full bg-mint-edge" />
              Siap bantu bikin panduan
            </span>
          </div>

          <FooterCol title="Produk" links={PRODUCT} />
          <FooterCol title="Sumber" links={RESOURCE} />
        </div>

        <div className="mt-16 flex flex-col gap-3 border-t border-rule pt-6 text-caption text-muted-gray sm:flex-row sm:items-center sm:justify-between">
          <span>© {new Date().getFullYear()} Docrivo. Dibuat untuk builder.</span>
          <div className="flex gap-6">
            <Link href="/#faq" className="link-underline">Ketentuan</Link>
            <Link href="/#faq" className="link-underline">Privasi</Link>
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
            <Link href={href} className="text-ink link-underline">{label}</Link>
          </li>
        ))}
      </ul>
    </div>
  );
}
