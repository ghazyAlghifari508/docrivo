"use client";

import { ArrowRight, GlobeHemisphereWest, Warning } from "@phosphor-icons/react";
import { useRouter } from "next/navigation";
import { useState, type FormEvent } from "react";

export function GenerationForm({ tone = "light" }: { tone?: "light" | "dark" }) {
  const router = useRouter();
  const [url, setUrl] = useState("");
  const [error, setError] = useState("");
  const [loading, setLoading] = useState(false);
  const dark = tone === "dark";

  async function submit(e: FormEvent) {
    e.preventDefault();
    if (!url.trim()) return setError("Link wajib diisi.");
    setLoading(true);
    setError("");
    const res = await fetch("/api/generations", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ url }),
    });
    const json = await res.json();
    if (!res.ok) {
      setLoading(false);
      setError("Panduan gagal dibuat. Pastikan link bisa dibuka, lalu coba lagi.");
      return;
    }
    router.push(`/generations/${json.jobId}`);
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
            Link website
          </label>
          <input
            id="url"
            type="url"
            inputMode="url"
            autoComplete="url"
            value={url}
            onChange={(e) => setUrl(e.target.value)}
            placeholder="https://brainfishai.com"
            disabled={loading}
            className="h-full min-w-0 flex-1 bg-transparent text-body-sm text-ink outline-none placeholder:text-muted-gray disabled:opacity-60"
          />
        </div>

        <button
          disabled={loading || !url.trim()}
          className="pressable inline-flex h-14 items-center justify-center gap-2 rounded-buttons border border-ink bg-lime-sprint px-6 text-body-sm font-medium text-ink shadow-hard disabled:cursor-not-allowed disabled:opacity-50"
        >
          {loading ? "Membuat panduan…" : "Buat panduan"}
          {!loading && <ArrowRight size={18} weight="bold" aria-hidden="true" />}
        </button>
      </div>

      <div className="mt-3 flex items-center gap-2">
        {error ? (
          <p role="alert" className="inline-flex items-center gap-1.5 text-caption font-medium text-red-700">
            <Warning size={15} weight="fill" aria-hidden="true" />
            {error}
          </p>
        ) : (
          <p className={`text-caption ${dark ? "text-paper-white/60" : "text-muted-gray"}`}>
            Tempel link website yang bisa dibuka umum. Proses biasanya selesai dalam beberapa menit.
          </p>
        )}
      </div>
    </form>
  );
}
