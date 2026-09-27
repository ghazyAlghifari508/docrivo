"use client";

import { Link, useNavigate } from "@tanstack/react-router";
import {
  ArrowClockwise,
  ClipboardText,
  DownloadSimple,
  Check,
  Warning,
  CircleNotch,
} from "@phosphor-icons/react";
import { useEffect, useRef, useState } from "react";

type Job = {
  id: string;
  sourceUrl: string;
  status: string;
  progress: number;
  errorMessage?: string;
  pagesAnalyzed: number;
  createdAt: string;
  assets: Array<{
    id: string;
    asset_type: string;
    source_url: string;
    filename?: string;
    status: string;
  }>;
  pages: Array<{
    id: string;
    url: string;
    title?: string;
    screenshot_desktop_url?: string;
  }>;
  result: null | { designMd: string; implementationPrompt: string };
};

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
  const [job, setJob] = useState<Job | null>(null);
  const [copied, setCopied] = useState(false);
  // ponytail: collapsed is always false — collapse toggle was never wired. Kept
  // the guarded markup rather than churn the whole render; drop the const + the
  // {collapsed && …} branch when the collapse feature is either built or cut.
  const collapsed = false;
  const [loadError, setLoadError] = useState<"" | "not_found" | "transient">(
    "",
  );
  // Sliding window of [timestamp, progress] samples — used to estimate remaining time.
  const samplesRef = useRef<Array<{ t: number; p: number }>>([]);
  const [remaining, setRemaining] = useState(0);
  // Reset the sample window when a new job id is shown.
  useEffect(() => {
    samplesRef.current = [];
  }, [id]);

  useEffect(() => {
    let alive = true;
    let timer: ReturnType<typeof setTimeout> | undefined;
    let controller: AbortController | undefined;

    async function tick() {
      controller = new AbortController();
      try {
        // TODO(Task 4.1): replace this poll with the `getOwnedJob` server
        // function (and, from Task 5.1, its TanStack Query option factory). The
        // `/api/generations/:id` handler was deleted in Task 3.1 and is not
        // being re-created.
        const res = await fetch(`/api/generations/${id}`, {
          cache: "no-store",
          signal: controller.signal,
        });
        if (res.status === 404) {
          if (alive) setLoadError("not_found");
          return;
        }
        if (!res.ok) throw new Error(String(res.status));
        const json = await res.json();
        if (!alive) return;
        setLoadError("");
        setJob(json);
        // Sliding window: keep up to 3 samples for progress-rate estimation.
        const samples = samplesRef.current;
        samples.push({ t: Date.now(), p: json.progress });
        if (samples.length > 3) samples.shift();
        if (
          samples.length >= 2 &&
          !["completed", "failed", "cancelled"].includes(json.status)
        ) {
          const dt = (samples[samples.length - 1].t - samples[0].t) / 1000;
          const dp = samples[samples.length - 1].p - samples[0].p;
          if (dp > 0)
            setRemaining(
              Math.round(((100 - samples[samples.length - 1].p) / dp) * dt),
            );
        }
        if (!["completed", "failed", "cancelled"].includes(json.status))
          // `() => void tick()` rather than `tick` itself: `tick` is async, and
          // `setTimeout` wants a void-returning callback.
          timer = setTimeout(() => void tick(), 2500);
      } catch (err) {
        if (
          !alive ||
          (err instanceof DOMException && err.name === "AbortError")
        )
          return;
        setLoadError("transient");
        timer = setTimeout(() => void tick(), 5000);
      }
    }
    void tick();
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

  if (!job) {
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
  const done = ["completed", "failed", "cancelled"].includes(job.status);
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
    <Shell id={embedded ? undefined : "main"}>
      {/* HERO STRIP · dark */}
      <section className="bg-depth text-paper-white">
        {collapsed && (
          <div className="page-shell pb-8">
            <div className="rounded-cards border border-paper-white/15 bg-paper-white/5 p-5">
              <p className="break-all text-body-sm text-paper-white/80">
                {job.sourceUrl}
              </p>
              <div className="mt-3 flex items-center gap-4">
                <span className="text-caption text-paper-white/60">
                  {done ? (failed ? "Gagal" : "Selesai") : "Berjalan"} •{" "}
                  {job.progress}%
                </span>
                {job.pagesAnalyzed > 0 && (
                  <span className="text-caption text-paper-white/60">
                    {job.pagesAnalyzed} halaman
                  </span>
                )}
              </div>
            </div>
          </div>
        )}

        {!collapsed && (
          <>
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
                {!done && remaining > 10 && (
                  <p className="mt-1 text-caption text-paper-white/40">
                    Estimasi sisa{" "}
                    {remaining >= 120
                      ? `${Math.round(remaining / 60)} menit`
                      : `${remaining} detik`}
                  </p>
                )}
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
          </>
        )}
      </section>

      {/* DOCUMENT + SIDEBAR · paper */}
      {!collapsed && (
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
      )}
    </Shell>
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
