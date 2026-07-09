"use client";

import Link from "next/link";
import {
  ArrowClockwise,
  ClipboardText,
  DownloadSimple,
  Check,
  Warning,
  CircleNotch,
} from "@phosphor-icons/react";
import { useEffect, useRef, useState } from "react";
import { pushHistory, getHistory } from "@/lib/history";

type Job = {
  id: string;
  sourceUrl: string;
  status: string;
  progress: number;
  errorMessage?: string;
  pagesAnalyzed: number;
  assets: Array<{ id: string; asset_type: string; source_url: string; filename?: string; status: string }>;
  pages: Array<{ id: string; url: string; title?: string; screenshot_desktop_url?: string }>;
  result: null | { designMd: string; implementationPrompt: string };
};

const STAGES = ["queued", "crawling", "capturing", "extracting", "generating", "completed"];
const STATUS_LABEL: Record<string, string> = {
  queued: "Menunggu giliran",
  crawling: "Membaca referensi",
  capturing: "Menangkap tampilan",
  extracting: "Membaca token visual",
  generating: "Menyusun DESIGN.md",
  completed: "Siap dipakai",
  failed: "Gagal",
  cancelled: "Dibatalkan",
};

export function GenerationResult({
  id,
  embedded = false,
  onRetry,
}: {
  id: string;
  embedded?: boolean;
  onRetry?: (jobId: string) => void;
}) {
  const [job, setJob] = useState<Job | null>(null);
  const [copied, setCopied] = useState(false);
  const [loadError, setLoadError] = useState<"" | "not_found" | "transient">("");
  const historySaved = useRef(false);

  // Reset the once-per-job guard when a new job id is shown (e.g. after retry).
  useEffect(() => {
    historySaved.current = false;
  }, [id]);

  // Only record history once the DESIGN.md is fully generated, never while it's
  // still processing — a half-finished job shouldn't clutter the history list.
  useEffect(() => {
    if (historySaved.current || job?.status !== "completed" || !job.result) return;
    historySaved.current = true;
    if (getHistory().some((h) => h.jobId === id)) return;
    pushHistory({ kind: "generate", url: job.sourceUrl, jobId: id });
  }, [job?.status, job?.result, job?.sourceUrl, id]);

  useEffect(() => {
    let alive = true;
    let timer: ReturnType<typeof setTimeout> | undefined;
    let controller: AbortController | undefined;

    async function tick() {
      controller = new AbortController();
      try {
        const res = await fetch(`/api/generations/${id}`, { cache: "no-store", signal: controller.signal });
        if (res.status === 404) {
          if (alive) setLoadError("not_found");
          return;
        }
        if (!res.ok) throw new Error(String(res.status));
        const json = await res.json();
        if (!alive) return;
        setLoadError("");
        setJob(json);
        if (!["completed", "failed", "cancelled"].includes(json.status)) timer = setTimeout(tick, 2500);
      } catch (err) {
        if (!alive || (err instanceof DOMException && err.name === "AbortError")) return;
        setLoadError("transient");
        timer = setTimeout(tick, 5000);
      }
    }
    tick();
    return () => {
      alive = false;
      controller?.abort();
      if (timer) clearTimeout(timer);
    };
  }, [id]);

  const Shell = embedded ? "div" : "main";

  if (loadError && !job) {
    const missing = loadError === "not_found";
    return (
      <Shell id={embedded ? undefined : "main"} className="grid min-h-[calc(100dvh-67px)] place-items-center bg-paper-white px-6">
        <div className="max-w-sm text-center">
          <span className="mx-auto grid size-12 place-items-center rounded-buttons border border-ink bg-cream shadow-hard">
            <Warning size={22} weight="fill" aria-hidden="true" />
          </span>
          <h1 className="mt-6 text-heading-sm font-semibold tracking-heading-sm">
            {missing ? "Hasil tidak ditemukan." : "Hasil belum bisa dimuat."}
          </h1>
          <p className="mt-3 text-body-sm leading-7 text-muted">
            {missing
              ? "Hasil DESIGN.md ini tidak tersedia lagi. Buat brief visual baru dari link publik."
              : "Koneksi sedang bermasalah. Halaman ini akan mencoba memuat ulang otomatis."}
          </p>
          <Link
            href="/"
            className="pressable mt-7 inline-flex h-11 items-center gap-2 rounded-buttons border border-ink bg-lime-sprint px-5 text-body-sm font-medium text-ink shadow-hard"
          >
            Buat DESIGN.md baru
          </Link>
        </div>
      </Shell>
    );
  }

  if (!job) {
    return (
      <Shell id={embedded ? undefined : "main"} className="grid min-h-64 place-items-center bg-paper-white">
        <div className="flex items-center gap-3 text-body-sm text-muted">
          <CircleNotch size={20} className="animate-spin" aria-hidden="true" />
          Menyiapkan hasil…
        </div>
      </Shell>
    );
  }

  const markdown = job.result?.designMd;
  const done = ["completed", "failed", "cancelled"].includes(job.status);
  const failed = job.status === "failed";

  async function copy() {
    if (!markdown) return;
    await navigator.clipboard.writeText(markdown);
    setCopied(true);
    setTimeout(() => setCopied(false), 1600);
  }

  return (
    <Shell id={embedded ? undefined : "main"}>
      {/* HERO STRIP · dark */}
      <section className="bg-depth text-paper-white">
        <div className="page-shell grid gap-8 py-12 lg:grid-cols-[1fr_360px] lg:items-end">
          <div>
            <StatusPill status={job.status} />
            <h1 className="mt-5 max-w-2xl text-heading-lg font-semibold leading-heading-lg tracking-heading-lg">
              DESIGN.md untuk <span className="emph">AI coding</span> kamu.
            </h1>
            <p className="mt-4 break-all text-body-sm text-paper-white/60">{job.sourceUrl}</p>
          </div>

          <div className="rounded-cards border border-paper-white/15 bg-paper-white/5 p-5">
            <div className="flex items-center justify-between text-caption text-paper-white/60">
              <span>Proses</span>
              <span className="inline-flex items-center gap-1.5 tabular-nums">
                {!done && <span className="inline-block size-3 rounded-full border-2 border-current border-t-transparent animate-spin" />}
                {job.progress}%
              </span>
            </div>
            <div
              role="progressbar"
              aria-valuemin={0}
              aria-valuemax={100}
              aria-valuenow={job.progress}
              aria-label="Progres pembuatan DESIGN.md"
              className="mt-3 h-2.5 overflow-hidden rounded-pills bg-paper-white/15"
            >
              <div
                className="h-full rounded-pills bg-lime-sprint transition-[width] duration-500"
                style={{ width: `${job.progress}%` }}
              />
            </div>
            <p aria-live="polite" className="mt-3 text-caption text-paper-white/70">
              {done
                ? failed
                  ? "Proses berhenti. Coba ulangi dari referensi yang sama."
                  : "DESIGN.md siap ditempel ke AI coding assistant."
                : `AI sedang ${STATUS_LABEL[job.status]?.toLowerCase() ?? "memproses"} halaman referensi…`}
            </p>
            {failed ? <Retry id={id} onRetry={onRetry} /> : null}
          </div>
        </div>

        {/* stage tracker */}
        {!failed && (
          <div className="page-shell pb-10">
            <ol className="flex flex-wrap gap-2">
              {STAGES.map((s) => {
                const idx = STAGES.indexOf(s);
                const cur = STAGES.indexOf(job.status);
                const state = cur > idx ? "done" : cur === idx ? "active" : "todo";
                return (
                  <li
                    key={s}
                    className={`inline-flex items-center gap-1.5 rounded-pills border px-3 py-1.5 text-caption font-medium capitalize ${
                      state === "done"
                        ? "border-mint-edge bg-mint-wash/10 text-mint-edge"
                        : state === "active"
                          ? "border-lime-sprint bg-lime-sprint/15 text-lime-sprint"
                          : "border-paper-white/15 text-paper-white/70"
                    }`}
                  >
                    {state === "done" ? <Check size={13} weight="bold" /> : null}
                    {STATUS_LABEL[s] ?? s}
                  </li>
                );
              })}
            </ol>
          </div>
        )}
      </section>

      {/* DOCUMENT + SIDEBAR · paper */}
      <section className="bg-paper-white">
        <div className="page-shell grid gap-6 py-12 lg:grid-cols-[1fr_320px]">
          <section className="overflow-hidden rounded-cards border border-ink bg-cream shadow-hard">
            <div className="flex flex-wrap items-center justify-end gap-2 border-b border-ink bg-paper-white p-3">
              {markdown ? (
                <button
                  onClick={copy}
                  className="inline-flex items-center gap-2 rounded-buttons border border-ink bg-paper-white px-3 py-2 text-caption font-medium"
                >
                  {copied ? <Check size={15} weight="bold" /> : <ClipboardText size={15} />}
                  {copied ? "Tersalin" : "Salin"}
                </button>
              ) : null}
              {job.result ? (
                <>
                  <a
                    href={`/api/generations/${id}/download?type=design-md`}
                    className="pressable inline-flex items-center gap-2 rounded-buttons border border-ink bg-lime-sprint px-3 py-2 text-caption font-medium text-ink shadow-hard"
                  >
                    <DownloadSimple size={15} /> Download DESIGN.md
                  </a>
                  <a
                    href={`/api/generations/${id}/download?type=prompt-md`}
                    className="pressable inline-flex items-center gap-2 rounded-buttons border border-ink bg-paper-white px-3 py-2 text-caption font-medium text-ink shadow-hard"
                  >
                    <DownloadSimple size={15} /> Download prompt
                  </a>
                </>
              ) : null}
            </div>

            {job.errorMessage ? (
              <p className="flex items-center gap-2 border-b border-ink bg-red-50 p-4 text-body-sm font-medium text-red-700">
                <Warning size={18} weight="fill" aria-hidden="true" />
                DESIGN.md belum bisa dibuat. Coba ulangi dari link yang sama.
              </p>
            ) : null}

            <pre className="max-h-[70vh] overflow-auto whitespace-pre-wrap bg-paper-white p-6 text-body-sm leading-7 text-ink">
              {markdown ??
                (done
                  ? "Hasil belum tersedia."
                  : "DESIGN.md akan muncul otomatis di sini saat siap ditempel ke AI coding assistant.")}
            </pre>
          </section>

          <aside className="space-y-4">
            <div className="grid grid-cols-2 gap-4">
              <Metric title="Halaman referensi" value={String(job.pagesAnalyzed)} />
              <Metric title="Sinyal visual" value={String(job.assets.length)} />
            </div>

            <div className="rounded-cards border border-rule bg-cream p-5">
              <h2 className="text-body-sm font-semibold">Halaman referensi</h2>
              {job.pages.length ? (
                <ul className="mt-4 space-y-3 text-caption leading-5 text-muted">
                  {job.pages.map((p) => (
                    <li key={p.id} className="break-all border-l-2 border-rule pl-3">
                      {p.title || p.url}
                    </li>
                  ))}
                </ul>
              ) : (
                <p className="mt-3 text-caption text-muted-gray">Belum ada halaman terekam.</p>
              )}
            </div>

            <div className="rounded-cards border border-mint-edge bg-mint-wash p-5">
              <h2 className="text-body-sm font-semibold">Catatan</h2>
              <p className="mt-2 text-caption leading-6 text-muted">
                DESIGN.md ini jadi briefing visual untuk AI coding assistant, bukan salinan brand atau aset target.
              </p>
            </div>
          </aside>
        </div>
      </section>
      </Shell>
  );
}

function Metric({ title, value }: { title: string; value: string }) {
  return (
    <div className="rounded-cards border border-rule bg-cream p-5">
      <p className="text-caption text-muted-gray">{title}</p>
      <p className="mt-2 text-heading font-semibold tabular-nums tracking-heading">{value}</p>
    </div>
  );
}

function StatusPill({ status }: { status: string }) {
  const failed = status === "failed";
  const done = status === "completed";
  if (failed) return <span className="inline-flex text-caption font-medium uppercase tracking-[0.06em] text-red-400">Gagal</span>;
  return (
    <span
      className={`inline-flex items-center gap-2 rounded-pills border px-3 py-1.5 text-caption font-medium uppercase tracking-[0.06em] ${
        failed
          ? "border-red-400/50 text-red-400"
          : done
            ? "border-mint-edge bg-mint-wash/10 text-mint-edge"
            : "border-lime-sprint bg-lime-sprint/15 text-lime-sprint"
      }`}
    >
      {!failed && <span className={`size-2 rounded-full ${done ? "bg-mint-edge" : "bg-lime-sprint"}`} />}
      {STATUS_LABEL[status] ?? status}
    </span>
  );
}

function Retry({ id, onRetry }: { id: string; onRetry?: (jobId: string) => void }) {
  async function retry() {
    const res = await fetch(`/api/generations/${id}/retry`, { method: "POST" });
    const json = await res.json();
    if (json.jobId) onRetry?.(json.jobId);
  }
  return (
    <button
      onClick={retry}
      className="pressable pressable-white mt-4 inline-flex w-full items-center justify-center gap-2 rounded-buttons border border-paper-white bg-lime-sprint px-4 py-2.5 text-body-sm font-medium text-ink shadow-hard-white"
    >
      <ArrowClockwise size={18} aria-hidden="true" />
      Coba lagi
    </button>
  );
}
