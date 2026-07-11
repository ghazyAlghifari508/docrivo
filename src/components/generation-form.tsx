"use client";

import { useRouter } from "next/navigation";
import { ArrowRight, GlobeHemisphereWest, Warning } from "@phosphor-icons/react";
import { useState, type FormEvent } from "react";

export function GenerationForm({
  tone = "light",
}: {
  tone?: "light" | "dark";
}) {
  const router = useRouter();
  const [url, setUrl] = useState("");
  const [error, setError] = useState("");
  const [loading, setLoading] = useState(false);
  const dark = tone === "dark";
  const helperId = "url-help";
  const errorId = "url-error";

  async function submit(e: FormEvent) {
    e.preventDefault();
    if (!url.trim()) return setError("Link wajib diisi.");
    setLoading(true);
    setError("");
    try {
      const res = await fetch("/api/generations", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ url }),
      });
      const json = await res.json();
      if (!res.ok) {
        setError("DESIGN.md gagal dibuat. Pastikan link publik bisa dibuka, lalu coba lagi.");
        return;
      }
      router.push(`/generations/${json.jobId}`);
    } catch {
      setError("Jaringan bermasalah. Coba lagi sebentar lagi.");
    } finally {
      setLoading(false);
    }
  }

  return (
    <form onSubmit={submit} className="w-full">
      <div className="flex flex-col gap-3 sm:flex-row">
        <div
          className={`flex h-14 flex-1 items-center gap-3 rounded-buttons border border-ink px-4 shadow-hard ${
            dark ? "bg-paper-white" : "bg-paper-white"
          }`}
        >
          <GlobeHemisphereWest size={20} weight="regular" className="shrink-0 text-muted" aria-hidden="true" />
          <label htmlFor="url" className="sr-only">
Website referensi
          </label>
          <input
            id="url"
            type="url"
            inputMode="url"
            autoComplete="url"
            value={url}
            onChange={(e) => setUrl(e.target.value)}
            placeholder="https://example.com"
            disabled={loading}
            required
            aria-invalid={!!error}
            aria-describedby={error ? errorId : helperId}
            className="h-full min-w-0 flex-1 bg-transparent text-body-sm text-ink outline-none placeholder:text-muted-gray disabled:opacity-60"
          />
        </div>

        <button
          disabled={loading || !url.trim()}
          className="pressable inline-flex h-14 items-center justify-center gap-2 rounded-buttons border border-ink bg-lime-sprint px-6 text-body-sm font-medium text-ink shadow-hard disabled:cursor-not-allowed disabled:opacity-50"
        >
          {loading ? "Menyusun DESIGN.md…" : "Buat DESIGN.md"}
          {!loading && <ArrowRight size={18} weight="bold" aria-hidden="true" />}
        </button>
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
