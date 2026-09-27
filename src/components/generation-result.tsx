"use client";

import { Link, useNavigate, isNotFound } from "@tanstack/react-router";
import { useQuery } from "@tanstack/react-query";
import {
  ArrowClockwise,
  ClipboardText,
  DownloadSimple,
  Check,
  Warning,
  CircleNotch,
} from "@phosphor-icons/react";
import { useState } from "react";
import { isTerminalJobStatus, jobQueryOptions } from "~/lib/queries/job";
import { CollapsibleOutput } from "~/components/collapsible-output";

const STAGES = [
  "queued",
  "crawling",
  "capturing",
  "extracting",
  "generating",
  "completed",
];
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
}: {
  id: string;
  embedded?: boolean;
}) {
  // The poll loop, the liveness flag, the not-found branch, the transient
  // branch and the three-sample ETA window all used to live here. The factory in
  // `~/lib/queries/job` owns the interval and when to stop; this component only
  // draws. `job` is typed from that factory's `queryFn`, so the hand-written
  // mirror of the job server function's return shape is gone with it.
  const { data: job, error, isPending } = useQuery(jobQueryOptions(id));
  const [copied, setCopied] = useState(false);

  const Shell = embedded ? "div" : "main";

  // An error after the first successful load leaves the last good data in place,
  // which is the same thing the old `loadError && !job` guard did: the finished
  // document stays readable while the poll recovers. The panel is for the case
  // where there is nothing to show at all.
  if (error && !job) {
    // `isNotFound` is the ownership answer and covers both halves of it -- a job
    // owned by somebody else and an id that does not exist raise the same
    // payload, so the two must not get different copy here.
    const missing = isNotFound(error);
    return (
      <Shell
        id={embedded ? undefined : "main"}
        className="grid min-h-[calc(100dvh-67px)] place-items-center bg-paper-white px-6"
      >
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
            to="/"
            className="pressable mt-7 inline-flex h-11 items-center gap-2 rounded-buttons border border-ink bg-lime-sprint px-5 text-body-sm font-medium text-ink shadow-hard"
          >
            Buat DESIGN.md baru
          </Link>
        </div>
      </Shell>
    );
  }

  if (isPending || !job) {
    return (
      <Shell
        id={embedded ? undefined : "main"}
        className="grid min-h-64 place-items-center bg-paper-white"
      >
        <div className="flex items-center gap-3 text-body-sm text-muted">
          <CircleNotch size={20} className="animate-spin" aria-hidden="true" />
          Menyiapkan hasil…
        </div>
      </Shell>
    );
  }

  const markdown = job.result?.designMd;
  const done = isTerminalJobStatus(job.status);
  const failed = job.status === "failed";

  async function copy() {
    if (!markdown) return;
    try {
      await navigator.clipboard.writeText(markdown);
      setCopied(true);
      setTimeout(() => setCopied(false), 1600);
    } catch {
      // Clipboard blocked (insecure context / denied permission) — leave label unchanged.
    }
  }

  return (
    <CollapsibleOutput
      label="Hasil DESIGN.md"
      summary={job.sourceUrl}
    >
      <Shell id={embedded ? undefined : "main"}>
        {/* HERO STRIP · dark */}
        <section className="bg-depth text-paper-white">
          <div className="page-shell grid gap-8 pb-12 lg:grid-cols-[1fr_360px] lg:items-end">
            <div>
              <h1 className="mt-5 max-w-2xl text-heading-lg font-semibold leading-heading-lg tracking-heading-lg">
                DESIGN.md untuk <span className="emph">AI coding</span> kamu.
              </h1>
              <p className="mt-4 break-all text-body-sm text-paper-white/60">
                {job.sourceUrl}
              </p>
            </div>

            <div className="rounded-cards border border-paper-white/15 bg-paper-white/5 p-5">
              <div className="flex items-center justify-between text-caption text-paper-white/60">
                <span>Proses</span>
                <span className="inline-flex items-center gap-1.5 tabular-nums">
                  {!done && (
                    <span className="inline-block size-3 rounded-full border-2 border-current border-t-transparent animate-spin" />
                  )}
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
              <p
                aria-live="polite"
                className="mt-3 text-caption text-paper-white/70"
              >
                {done
                  ? failed
                    ? "Proses berhenti. Coba ulangi dari referensi yang sama."
                    : "DESIGN.md siap ditempel ke AI coding assistant."
                  : `AI sedang ${STATUS_LABEL[job.status]?.toLowerCase() ?? "memproses"} halaman referensi…`}
              </p>
              {failed ? <Retry sourceUrl={job.sourceUrl} /> : null}
            </div>
          </div>

          {/* stage tracker — plain text only, no badges */}
          {!failed && (
            <div className="page-shell pb-10">
              <ol className="flex flex-wrap gap-x-4 gap-y-1">
                {STAGES.map((s) => {
                  const idx = STAGES.indexOf(s);
                  const cur = STAGES.indexOf(job.status);
                  const state =
                    cur > idx ? "done" : cur === idx ? "active" : "todo";
                  const label = STATUS_LABEL[s] ?? s;
                  return (
                    <li
                      key={s}
                      className={`inline-flex items-center gap-1 text-caption font-medium capitalize ${
                        state === "active"
                          ? "text-lime-sprint"
                          : state === "done"
                            ? "text-mint-edge/60"
                            : "text-paper-white/40"
                      }`}
                    >
                      {state === "done" ? (
                        <Check size={12} weight="bold" />
                      ) : null}
                      {state === "active" ? (
                        <AnimatedLabel label={label} />
                      ) : (
                        label
                      )}
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
                    {copied ? (
                      <Check size={15} weight="bold" />
                    ) : (
                      <ClipboardText size={15} />
                    )}
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
                <div className="border-b border-ink bg-red-50 p-4">
                  <p className="flex items-center gap-2 text-body-sm font-medium text-red-700">
                    <Warning size={18} weight="fill" aria-hidden="true" />
                    DESIGN.md belum bisa dibuat. Coba ulangi dari link yang sama.
                  </p>
                  {job.errorMessage !== "DESIGN.md belum bisa dibuat. Coba ulangi dari link yang sama." && (
                    <p className="mt-1 text-caption text-red-500/80">{job.errorMessage}</p>
                  )}
                </div>
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
                <Metric
                  title="Halaman referensi"
                  value={String(job.pagesAnalyzed)}
                />
                <Metric
                  title="Sinyal visual"
                  value={String(job.assets.length)}
                />
              </div>

              <div className="rounded-cards border border-rule bg-cream p-5">
                <h2 className="text-body-sm font-semibold">
                  Halaman referensi
                </h2>
                {job.pages.length ? (
                  <ul className="mt-4 space-y-3 text-caption leading-5 text-muted">
                    {job.pages.map((p) => (
                      <li
                        key={p.id}
                        className="break-all border-l-2 border-rule pl-3"
                      >
                        {p.title || p.url}
                      </li>
                    ))}
                  </ul>
                ) : (
                  <p className="mt-3 text-caption text-muted-gray">
                    Belum ada halaman terekam.
                  </p>
                )}
              </div>

              <div className="rounded-cards border border-mint-edge bg-mint-wash p-5">
                <h2 className="text-body-sm font-semibold">Catatan</h2>
                <p className="mt-2 text-caption leading-6 text-muted">
                  DESIGN.md ini jadi briefing visual untuk AI coding assistant,
                  bukan salinan brand atau aset target.
                </p>
              </div>
            </aside>
          </div>
        </section>
      </Shell>
    </CollapsibleOutput>
  );
}

function Metric({ title, value }: { title: string; value: string }) {
  return (
    <div className="rounded-cards border border-rule bg-cream p-5">
      <p className="text-caption text-muted-gray">{title}</p>
      <p className="mt-2 text-heading font-semibold tabular-nums tracking-heading">
        {value}
      </p>
    </div>
  );
}

/** Label with animated dots: "." → ".." → "..." cyclically. */
function AnimatedLabel({ label }: { label: string }) {
  return (
    <span>
      {label}
      <span className="dots-anim" />
    </span>
  );
}


function Retry({ sourceUrl }: { sourceUrl: string }) {
  const navigate = useNavigate();
  return (
    <button
      onClick={() =>
        void navigate({ to: "/", search: { url: sourceUrl } })
      }
      className="pressable pressable-white mt-4 inline-flex w-full items-center justify-center gap-2 rounded-buttons border border-paper-white bg-lime-sprint px-4 py-2.5 text-body-sm font-medium text-ink shadow-hard-white"
    >
      <ArrowClockwise size={18} aria-hidden="true" />
      Coba lagi
    </button>
  );
}

<style>{`.dots-anim::after { content: "."; animation: dots 1.8s steps(3) infinite; } @keyframes dots { 33% { content: ".."; } 66% { content: "..."; } }`}</style>;
