"use client";

import { ArrowRight, GlobeHemisphereWest, Warning, DownloadSimple, CircleNotch, Code } from "@phosphor-icons/react";
import { useEffect, useRef, useState, type FormEvent } from "react";

type Scraped = { sourceUrl: string; status: number; html: string; blobUrl: string; previewUrl: string };
type ResultView = "preview" | "code";

export function HtmlScraper() {
  const [url, setUrl] = useState("");
  const [error, setError] = useState("");
  const [loading, setLoading] = useState(false);
  const [result, setResult] = useState<Scraped | null>(null);
  const [view, setView] = useState<ResultView>("preview");
  const blobRef = useRef("");
  const aliveRef = useRef(true);

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
    setLoading(true);
    setError("");
    if (blobRef.current) {
      URL.revokeObjectURL(blobRef.current);
      blobRef.current = "";
    }
    setResult(null);
    try {
      const res = await fetch("/api/scrape", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ url }),
      });
      const json = await res.json();
      if (!res.ok) {
        setError("Gagal mengambil HTML. Pastikan link publik bisa dibuka, lalu coba lagi.");
        return;
      }
      const blobUrl = URL.createObjectURL(new Blob([json.html], { type: "text/html" }));
      const previewUrl = `/api/scrape/preview?url=${encodeURIComponent(url)}`;
      if (!aliveRef.current) {
        URL.revokeObjectURL(blobUrl);
        return;
      }
      blobRef.current = blobUrl;
      setView("preview");
      setResult({ ...json, blobUrl, previewUrl });
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
              value={url}
              onChange={(e) => setUrl(e.target.value)}
              placeholder="https://example.com"
              disabled={loading}
              required
              aria-invalid={!!error}
              aria-describedby="scrape-help"
              className="h-full min-w-0 flex-1 bg-transparent text-body-sm text-ink outline-none placeholder:text-muted-gray disabled:opacity-60"
            />
          </div>
          <button
            disabled={loading || !url.trim()}
            className="pressable inline-flex h-14 items-center justify-center gap-2 rounded-buttons border border-ink bg-lime-sprint px-6 text-body-sm font-medium text-ink shadow-hard disabled:cursor-not-allowed disabled:opacity-50"
          >
            {loading ? "Mengambil HTML…" : "Scrape HTML"}
            {!loading && <ArrowRight size={18} weight="bold" aria-hidden="true" />}
          </button>
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
            <span className="inline-flex min-w-0 items-center gap-2 break-all text-caption font-medium text-muted">
              <Code size={15} aria-hidden="true" /> {result?.sourceUrl ?? url.trim()}
            </span>
            {result ? (
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
          {!result ? (
            <div className="grid h-[75vh] place-items-center bg-paper-white p-8 text-center">
              <div>
                <CircleNotch size={26} className="mx-auto animate-spin text-muted" aria-hidden="true" />
                <p className="mt-4 text-body-sm font-medium text-ink">AI sedang melakukan scraping HTML…</p>
                <p className="mt-2 text-caption text-muted-gray">Preview dan code akan muncul setelah index.html selesai diambil.</p>
              </div>
            </div>
          ) : view === "preview" ? (
            <iframe
              title={`Preview ${result.sourceUrl}`}
              src={result.previewUrl}
              sandbox="allow-same-origin"
              referrerPolicy="no-referrer"
              className="h-[75vh] w-full bg-paper-white"
            />
          ) : (
            <pre tabIndex={0} aria-label="Kode HTML hasil scrape" className="h-[75vh] overflow-auto bg-[#111] p-5 text-[12px] leading-5 text-paper-white">
              <code>{result.html}</code>
            </pre>
          )}
        </section>
      ) : null}
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
