import Link from "next/link";

function quota(v: number | null, label: string) {
  return v == null ? `Unlimited ${label}` : `${v} ${label}`;
}

export function CreditBadge({
  planLabel,
  design,
  scrape,
}: {
  planLabel: string;
  design: number | null;
  scrape: number | null;
}) {
  return (
    <div className="inline-flex flex-wrap items-center justify-center gap-x-3 gap-y-1 rounded-buttons border border-ink bg-paper-white px-4 py-2 text-caption text-muted shadow-hard">
      <span className="font-semibold text-ink">Paket {planLabel}</span>
      <span aria-hidden="true">·</span>
      <span>
        Sisa <span className="font-semibold text-ink">{quota(design, "DESIGN.md")}</span>
      </span>
      <span aria-hidden="true">·</span>
      <span>
        <span className="font-semibold text-ink">{quota(scrape, "Scrape")}</span>
      </span>
      <Link href="/pricing" className="link-underline font-semibold text-ink">
        Upgrade
      </Link>
    </div>
  );
}
