"use client";

import Link from "next/link";
import { ArrowRight, GlobeHemisphereWest, Warning, DownloadSimple, CircleNotch, Code, CaretDown, CaretUp } from "@phosphor-icons/react";
import { useEffect, useRef, useState, type FormEvent } from "react";

type Scraped = {
  sourceUrl: string;
  status: number;
  html: string;
  previewHtml: string;
  blobUrl: string;
  metadata: {
    attempt: number;
    capturedAt: string;
    finalUrl: string;
    viewport: { width: number; height: number };
    captureMode: string;
    htmlBytes: number;
    previewHtmlBytes: number;
  };
};
type ResultView = "preview" | "code";

export function HtmlScraper({
  guest = false,
  remaining = null,
  onQuotaExceeded,
  onConsumed,
}: {
  guest?: boolean;
  remaining?: number | null;
  onQuotaExceeded?: () => void;
  onConsumed?: () => void;
} = {}) {
  const [url, setUrl] = useState("");
  const [error, setError] = useState("");
  const [loading, setLoading] = useState(false);
  const [result, setResult] = useState<Scraped | null>(null);
  const [view, setView] = useState<ResultView>("preview");
  const [collapsed, setCollapsed] = useState(false);
  const blobRef = useRef("");
  const aliveRef = useRef(true);
  const outOfCredit = remaining != null && remaining <= 0;

  // Revoke the previous preview blob on replace/unmount to avoid leaking object URLs.
  useEffect(() => {
    aliveRef.current = true;
    return () => {
      aliveRef.current = false;
      if (blobRef.current) URL.revokeObjectURL(blobRef.current);
    };
  }, []);

  async function submit(e: FormEvent) {
    e.preventDefault();
    if (!url.trim()) return setError("Link wajib diisi.");
    // Client pre-check: no credit → modal, never hit the server.
    if (outOfCredit) return onQuotaExceeded?.();
    setLoading(true);
    setError("");
    if (blobRef.current) {
      URL.revokeObjectURL(blobRef.current);
      blobRef.current = "";
    }
    setResult(null);
    setCollapsed(false);
    try {
      const targetUrl = url.trim();
      const res = await fetch("/api/scrape", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ url: targetUrl }),
      });
      const json = await res.json();
      if (res.status === 402) {
        onQuotaExceeded?.();
        return;
      }
      if (!res.ok) {
        setError("Gagal mengambil HTML. Pastikan link publik bisa dibuka, lalu coba lagi.");
        return;
      }
      const scrapeId = json.scrapeId;
      if (!scrapeId) {
        if (aliveRef.current) setError("Gagal menyimpan hasil scrape.");
        return;
      }
      onConsumed?.();
      if (!aliveRef.current) return;
      const blobUrl = URL.createObjectURL(new Blob([json.html], { type: "text/html" }));
      blobRef.current = blobUrl;
      setView("preview");
      setResult({ ...json, blobUrl });
    } catch {
      setError("Jaringan bermasalah. Coba lagi sebentar lagi.");
    } finally {
      setLoading(false);
    }
  }

  return (
    <div className="w-full">
      <form onSubmit={submit} className="mx-auto max-w-2xl">
        <div className="flex flex-col gap-3 sm:flex-row">
          <div className="flex h-14 flex-1 items-center gap-3 rounded-buttons border border-ink bg-paper-white px-4 shadow-hard">
            <GlobeHemisphereWest size={20} className="shrink-0 text-muted" aria-hidden="true" />
            <label htmlFor="scrape-url" className="sr-only">Website yang ingin di-scrape</label>
            <input
              id="scrape-url"
              type="url"
              inputMode="url"
              autoComplete="url"
              name="url"
              value={url}
              onChange={(e) => setUrl(e.target.value)}
              placeholder="https://example.com"
              disabled={loading || guest}
              required
              aria-invalid={!!error}
              aria-describedby="scrape-help"
              className="h-full min-w-0 flex-1 bg-transparent text-body-sm text-ink outline-none placeholder:text-muted-gray disabled:opacity-60"
            />
          </div>
          {guest ? (
            <Link
              href="/login"
              className="pressable inline-flex h-14 items-center justify-center gap-2 rounded-buttons border border-ink bg-lime-sprint px-6 text-body-sm font-medium text-ink shadow-hard"
            >
              Masuk untuk mulai
              <ArrowRight size={18} weight="bold" aria-hidden="true" />
            </Link>
          ) : (
            <button
              disabled={loading || !url.trim()}
              className="pressable inline-flex h-14 items-center justify-center gap-2 rounded-buttons border border-ink bg-lime-sprint px-6 text-body-sm font-medium text-ink shadow-hard disabled:cursor-not-allowed disabled:opacity-50"
            >
              {loading ? "Mengambil HTML…" : "Scrape HTML"}
              {!loading && <ArrowRight size={18} weight="bold" aria-hidden="true" />}
            </button>
          )}
        </div>
        <div className="mt-3">
          {error ? (
            <p id="scrape-help" role="alert" className="inline-flex items-center gap-1.5 text-caption font-medium text-red-700">
              <Warning size={15} weight="fill" aria-hidden="true" />
              {error}
            </p>
          ) : (
            <p id="scrape-help" className="text-caption text-muted-gray">
              Ambil index.html dari website publik, lihat preview-nya, lalu unduh untuk dipakai ulang.
            </p>
          )}
        </div>
      </form>

      {loading || result ? (
        <section className="mt-8 overflow-hidden rounded-cards border border-ink bg-cream text-left shadow-hard">
          <div className="flex flex-wrap items-center justify-between gap-3 border-b border-ink bg-paper-white p-3">
            <div className="flex min-w-0 flex-1 items-center gap-2">
              {result ? (
                <button
                  onClick={() => setCollapsed(!collapsed)}
                  className="inline-flex items-center gap-1.5 rounded-buttons border border-ink bg-paper-white px-2 py-1.5 text-caption font-medium hover:bg-cream"
                  aria-label={collapsed ? "Expand hasil" : "Minimize hasil"}
                >
                  {collapsed ? <CaretUp size={14} /> : <CaretDown size={14} />}
                </button>
              ) : null}
              <span className="inline-flex min-w-0 items-center gap-2 break-all text-caption font-medium text-muted">
                <Code size={15} aria-hidden="true" /> {result?.sourceUrl ?? url.trim()}
              </span>
            </div>
            {result && !collapsed ? (
              <div className="flex flex-wrap items-center gap-2">
                <div aria-label="Tampilan hasil HTML" className="inline-flex rounded-buttons border border-ink bg-cream p-1">
                  <ViewButton active={view === "preview"} onClick={() => setView("preview")}>Preview</ViewButton>
                  <ViewButton active={view === "code"} onClick={() => setView("code")}>Code</ViewButton>
                </div>
                <a
                  href={result.blobUrl}
                  download="index.html"
                  className="pressable inline-flex items-center gap-2 rounded-buttons border border-ink bg-lime-sprint px-3 py-2 text-caption font-medium text-ink shadow-hard"
                >
                  <DownloadSimple size={15} /> Download index.html
                </a>
              </div>
            ) : null}
          </div>

          {result && collapsed ? (
            <div className="bg-paper-white p-5">
              <div className="rounded-cards border border-rule bg-cream p-4">
                <p className="break-all text-body-sm text-ink">{result.sourceUrl}</p>
                <div className="mt-3 flex flex-wrap items-center gap-4 text-caption text-muted-gray">
                  <span>Attempt #{result.metadata.attempt}</span>
                  <span>{result.metadata.viewport.width}×{result.metadata.viewport.height}</span>
                  <span>{Math.round(result.metadata.htmlBytes / 1024).toLocaleString("id-ID")} KB</span>
                </div>
              </div>
            </div>
          ) : null}

          {!collapsed && (
            <>
              {result ? <ScrapeMetadata result={result} /> : null}
              {!result ? (
                <div className="grid h-[calc(100dvh-150px)] min-h-[620px] place-items-center bg-paper-white p-8 text-center">
                  <div>
                    <CircleNotch size={26} className="mx-auto animate-spin text-muted" aria-hidden="true" />
                    <p className="mt-4 text-body-sm font-medium text-ink">AI sedang melakukan scraping HTML…</p>
                    <p className="mt-2 text-caption text-muted-gray">Preview dan code akan muncul setelah index.html selesai diambil.</p>
                  </div>
                </div>
              ) : view === "preview" ? (
                <iframe
                  title={`Preview ${result.sourceUrl}`}
                  srcDoc={result.previewHtml}
                  sandbox="allow-scripts"
                  referrerPolicy="no-referrer"
                  className="h-[calc(100dvh-150px)] min-h-[620px] w-full bg-paper-white"
                />
              ) : (
                <pre tabIndex={0} aria-label="Kode HTML hasil scrape" className="h-[calc(100dvh-150px)] min-h-[620px] overflow-auto bg-[#111] p-5 text-[12px] leading-5 text-paper-white">
                  <code>{result.html}</code>
                </pre>
              )}
            </>
          )}
        </section>
      ) : null}
    </div>
  );
}

function ScrapeMetadata({ result }: { result: Scraped }) {
  const captured = new Date(result.metadata.capturedAt).toLocaleString("id-ID", {
    dateStyle: "medium",
    timeStyle: "short",
  });
  const sizeKb = Math.round(result.metadata.htmlBytes / 1024).toLocaleString("id-ID");
  const viewport = `${result.metadata.viewport.width}×${result.metadata.viewport.height}`;
  const redirected = result.metadata.finalUrl !== result.sourceUrl;
  return (
    <dl className="grid gap-2 border-b border-ink bg-paper-white px-4 py-3 text-caption text-muted-gray sm:grid-cols-2 lg:grid-cols-4">
      <MetaItem label="Attempt" value={`#${result.metadata.attempt} · ${result.metadata.captureMode}`} />
      <MetaItem label="Viewport" value={viewport} />
      <MetaItem label="Diambil" value={captured} />
      <MetaItem label="HTML" value={`${sizeKb} KB`} />
      {redirected && <MetaItem label="Final URL" value={result.metadata.finalUrl} />}
    </dl>
  );
}

function MetaItem({ label, value }: { label: string; value: string }) {
  return (
    <div className="min-w-0">
      <dt className="font-medium text-muted">{label}</dt>
      <dd className="truncate">{value}</dd>
    </div>
  );
}

function ViewButton({ active, onClick, children }: { active: boolean; onClick: () => void; children: React.ReactNode }) {
  return (
    <button
      type="button"
      aria-pressed={active}
      onClick={onClick}
      className={`rounded-[3px] px-3 py-1.5 text-caption font-medium ${active ? "bg-lime-sprint text-ink" : "text-muted hover:text-ink"}`}
    >
      {children}
    </button>
  );
}
