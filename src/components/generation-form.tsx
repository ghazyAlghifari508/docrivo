"use client";

import { Link, useNavigate, useSearch } from "@tanstack/react-router";
import { ArrowRight, GlobeHemisphereWest, Warning } from "@phosphor-icons/react";
import { useState, type FormEvent } from "react";

export function GenerationForm({
  tone = "light",
  guest = false,
  remaining = null,
  onQuotaExceeded,
  onCreated,
}: {
  tone?: "light" | "dark";
  guest?: boolean;
  remaining?: number | null;
  onQuotaExceeded?: () => void;
  onCreated?: (jobId: string) => void;
}) {
  const navigate = useNavigate();
  // `strict: false` because `?url=` is not declared by `/`'s `validateSearch` --
  // the home route has no search schema, and a strict read would throw.
  const search = useSearch({ strict: false }) as { url?: unknown };
  const [url, setUrl] = useState(typeof search.url === "string" ? search.url : "");
  const [error, setError] = useState("");
  const [loading, setLoading] = useState(false);
  const dark = tone === "dark";
  const helperId = "url-help";
  const errorId = "url-error";
  const outOfCredit = remaining != null && remaining <= 0;

  async function submit(e: FormEvent) {
    e.preventDefault();
    if (!url.trim()) return setError("Link wajib diisi.");
    // Client pre-check: no credit → modal, never hit the server.
    if (outOfCredit) return onQuotaExceeded?.();
    setLoading(true);
    setError("");
    try {
      // TODO(Task 4.1): replace this POST with the `createGeneration` server
      // function. The `/api/generations` handler was deleted in Task 3.1 and is
      // not being re-created -- Task 4.1 owns the equivalent server function.
      const res = await fetch("/api/generations", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ url }),
      });
      const json = await res.json();
      if (res.status === 401) {
        void navigate({ to: "/login" });
        return;
      }
      if (res.status === 402) {
        onQuotaExceeded?.();
        return;
      }
      if (!res.ok) {
        setError("DESIGN.md gagal dibuat. Pastikan link publik bisa dibuka, lalu coba lagi.");
        return;
      }
      onCreated?.(json.jobId);
      void navigate({ to: "/generations/$id", params: { id: json.jobId } });
    } catch {
      setError("Jaringan bermasalah. Coba lagi sebentar lagi.");
    } finally {
      setLoading(false);
    }
  }

  return (
    <form onSubmit={submit} className="w-full">
      <div className="flex flex-col gap-3 sm:flex-row">
        <div className="flex h-14 flex-1 items-center gap-3 rounded-buttons border border-ink bg-paper-white px-4 shadow-hard">
          <GlobeHemisphereWest size={20} weight="regular" className="shrink-0 text-muted" aria-hidden="true" />
          <label htmlFor="url" className="sr-only">
Website referensi
          </label>
          <input
            id="url"
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
            aria-describedby={error ? errorId : helperId}
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
            {loading ? "Menyusun DESIGN.md…" : "Buat DESIGN.md"}
            {!loading && <ArrowRight size={18} weight="bold" aria-hidden="true" />}
          </button>
        )}
      </div>

      <div className="mt-3 flex items-center justify-center gap-2">
        {error ? (
          <p id={errorId} role="alert" className="inline-flex items-center gap-1.5 text-caption font-medium text-red-700">
            <Warning size={15} weight="fill" aria-hidden="true" />
            {error}
          </p>
        ) : (
          <p id={helperId} className={`text-caption text-center ${dark ? "text-paper-white/60" : "text-muted-gray"}`}>
            Tempel website publik yang style-nya ingin kamu jadikan instruksi untuk AI coding assistant.
          </p>
        )}
      </div>
    </form>
  );
}
