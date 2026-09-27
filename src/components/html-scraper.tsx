"use client";

import { Link, useNavigate } from "@tanstack/react-router";
import { ArrowRight, GlobeHemisphereWest, Warning } from "@phosphor-icons/react";
import { useState, type FormEvent } from "react";
import { setActiveScrapeId } from "~/lib/history";
import { createScrape } from "~/queries/scrapes";

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
  const navigate = useNavigate();
  const [url, setUrl] = useState("");
  const [error, setError] = useState("");
  const [loading, setLoading] = useState(false);
  const outOfCredit = remaining != null && remaining <= 0;

  async function submit(e: FormEvent) {
    e.preventDefault();
    if (!url.trim()) return setError("Link wajib diisi.");
    // Client pre-check: no credit → modal, never hit the server.
    if (outOfCredit) return onQuotaExceeded?.();
    setLoading(true);
    setError("");
    try {
      // The server function resolves the user from the session, so there is no
      // `userId` in the payload to forge, and it answers with a discriminated
      // result so each failure keeps its own message.
      const result = await createScrape({ data: { url: url.trim() } });

      if (!result.ok) {
        if (result.error.code === "QUOTA_EXCEEDED") {
          onQuotaExceeded?.();
          return;
        }
        if (result.error.code === "UNAUTHORIZED") {
          void navigate({ to: "/login" });
          return;
        }
        // Surface the server's real reason. Only fall back to the URL-is-public
        // hint when the server gave nothing useful — that hint is misleading
        // for transient backend errors (502/503/PGRST002).
        const fromServer = result.error.message?.trim();
        setError(fromServer || "Gagal mengambil HTML. Coba lagi sebentar lagi.");
        return;
      }

      onConsumed?.();
      setActiveScrapeId(result.scrapeId);
      void navigate({ to: "/history/scrapes/$id", params: { id: result.scrapeId } });
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
              to="/login"
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
    </div>
  );
}
