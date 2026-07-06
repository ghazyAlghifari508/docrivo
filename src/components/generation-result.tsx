"use client";

import Link from "next/link";
import {
  ArrowClockwise,
  ClipboardText,
  DownloadSimple,
  FileMd,
  FileText,
  Check,
  Warning,
  CircleNotch,
  ArrowRight,
} from "@phosphor-icons/react";
import { useEffect, useState } from "react";
import { SiteHeader } from "./site-header";
import { SiteFooter } from "./site-footer";

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
  crawling: "Membaca halaman",
  capturing: "Melihat tampilan",
  extracting: "Merangkum gaya",
  generating: "Menyusun panduan",
  completed: "Selesai",
  failed: "Gagal",
  cancelled: "Dibatalkan",
};

export function GenerationResult({ id }: { id: string }) {
  const [job, setJob] = useState<Job | null>(null);
  const [tab, setTab] = useState<"design" | "prompt">("design");
  const [copied, setCopied] = useState(false);
  const [loadError, setLoadError] = useState(false);

  useEffect(() => {
    let alive = true;
    async function tick() {
      try {
        const res = await fetch(`/api/generations/${id}`, { cache: "no-store" });
        if (!res.ok) throw new Error(String(res.status));
        const json = await res.json();
        if (!alive) return;
        setJob(json);
        if (!["completed", "failed", "cancelled"].includes(json.status)) setTimeout(tick, 2500);
      } catch {
        if (alive) setLoadError(true);
      }
    }
    tick();
    return () => {
      alive = false;
    };
  }, [id]);

  if (loadError && !job) {
    return (
      <>
        <SiteHeader />
        <main className="grid min-h-[calc(100dvh-67px)] place-items-center bg-paper-white px-6">
          <div className="max-w-sm text-center">
            <span className="mx-auto grid size-12 place-items-center rounded-buttons border border-ink bg-cream shadow-hard">
              <Warning size={22} weight="fill" aria-hidden="true" />
            </span>
            <h1 className="mt-6 text-heading-sm font-semibold tracking-heading-sm">Hasil tidak ditemukan.</h1>
            <p className="mt-3 text-body-sm leading-7 text-muted">
              Link hasil ini tidak tersedia lagi. Kamu bisa membuat panduan baru dari website referensi.
            </p>
            <Link
              href="/#generate"
              className="pressable mt-7 inline-flex h-11 items-center gap-2 rounded-buttons border border-ink bg-lime-sprint px-5 text-body-sm font-medium text-ink shadow-hard"
            >
              Buat panduan baru
              <ArrowRight size={16} weight="bold" aria-hidden="true" />
            </Link>
          </div>
        </main>
      </>
    );
  }

  if (!job) {
    return (
      <>
        <SiteHeader />
        <main className="grid min-h-[calc(100dvh-67px)] place-items-center bg-paper-white">
          <div className="flex items-center gap-3 text-body-sm text-muted">
            <CircleNotch size={20} className="animate-spin" aria-hidden="true" />
            Menyiapkan hasil…
          </div>
        </main>
      </>
    );
  }

  const markdown = tab === "design" ? job.result?.designMd : job.result?.implementationPrompt;
  const done = ["completed", "failed", "cancelled"].includes(job.status);
  const failed = job.status === "failed";

  async function copy() {
    if (!markdown) return;
    await navigator.clipboard.writeText(markdown);
    setCopied(true);
    setTimeout(() => setCopied(false), 1600);
  }

  return (
    <>
      <SiteHeader />

      {/* HERO STRIP · dark */}
      <section className="bg-depth text-paper-white">
        <div className="page-shell grid gap-8 py-12 lg:grid-cols-[1fr_360px] lg:items-end">
          <div>
            <StatusPill status={job.status} />
            <h1 className="mt-5 max-w-2xl text-heading-lg font-semibold leading-heading-lg tracking-heading-lg">
              Panduan visual untuk <span className="emph">website</span> referensi.
            </h1>
            <p className="mt-4 break-all text-body-sm text-paper-white/60">{job.sourceUrl}</p>
          </div>

          <div className="rounded-cards border border-paper-white/15 bg-paper-white/5 p-5">
            <div className="flex items-center justify-between text-caption text-paper-white/60">
              <span>Proses</span>
              <span className="tabular-nums">{job.progress}%</span>
            </div>
            <div className="mt-3 h-2.5 overflow-hidden rounded-pills bg-paper-white/15">
              <div
                className="h-full rounded-pills bg-lime-sprint transition-[width] duration-500"
                style={{ width: `${job.progress}%` }}
              />
            </div>
            <p className="mt-3 text-caption text-paper-white/50">
              {done
                ? failed
                  ? "Proses berhenti. Coba ulangi dari referensi yang sama."
                  : "Panduan siap digunakan."
                : "Kami sedang membaca tampilan website dan menyusun panduan."}
            </p>
            {failed ? <Retry id={id} /> : null}
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
                          : "border-paper-white/15 text-paper-white/40"
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
      <main className="bg-paper-white">
        <div className="page-shell grid gap-6 py-12 lg:grid-cols-[1fr_320px]">
          <section className="overflow-hidden rounded-cards border border-ink bg-cream shadow-hard">
            <div className="flex flex-wrap items-center gap-2 border-b border-ink bg-paper-white p-3">
              <TabButton active={tab === "design"} onClick={() => setTab("design")} icon={FileMd}>
                Panduan desain
              </TabButton>
              <TabButton active={tab === "prompt"} onClick={() => setTab("prompt")} icon={FileText}>
                Arahan kerja
              </TabButton>
              <div className="ml-auto flex items-center gap-2">
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
                  <a
                    href={`/api/generations/${id}/download?type=${tab === "design" ? "design-md" : "prompt-md"}`}
                    className="pressable inline-flex items-center gap-2 rounded-buttons border border-ink bg-lime-sprint px-3 py-2 text-caption font-medium text-ink shadow-hard"
                  >
                    <DownloadSimple size={15} /> Download
                  </a>
                ) : null}
              </div>
            </div>

            {job.errorMessage ? (
              <p className="flex items-center gap-2 border-b border-ink bg-red-50 p-4 text-body-sm font-medium text-red-700">
                <Warning size={18} weight="fill" aria-hidden="true" />
                Panduan belum bisa dibuat. Coba ulangi dari website referensi yang sama.
              </p>
            ) : null}

            <pre className="max-h-[70vh] overflow-auto whitespace-pre-wrap bg-paper-white p-6 text-body-sm leading-7 text-ink">
              {markdown ??
                (done
                  ? "Hasil belum tersedia."
                  : "Panduan akan muncul otomatis di sini saat sudah siap.")}
            </pre>
          </section>

          <aside className="space-y-4">
            <div className="grid grid-cols-2 gap-4">
              <Metric title="Halaman dibaca" value={String(job.pagesAnalyzed)} />
              <Metric title="Elemen visual" value={String(job.assets.length)} />
            </div>

            <div className="rounded-cards border border-rule bg-cream p-5">
              <h2 className="text-body-sm font-semibold">Halaman yang dibaca</h2>
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
                Docrivo membaca pola visual sebagai referensi. Hasil akhirnya tetap dibuat untuk produkmu.
              </p>
            </div>
          </aside>
        </div>
      </main>

      <SiteFooter />
    </>
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

function TabButton({
  active,
  onClick,
  icon: Icon,
  children,
}: {
  active: boolean;
  onClick: () => void;
  icon: React.ComponentType<{ size?: number; weight?: "bold" | "fill" | "regular" }>;
  children: React.ReactNode;
}) {
  return (
    <button
      onClick={onClick}
      aria-pressed={active}
      className={`inline-flex items-center gap-2 rounded-buttons border border-ink px-3 py-2 text-caption font-medium ${
        active ? "bg-lime-sprint shadow-hard" : "bg-paper-white"
      }`}
    >
      <Icon size={15} weight="regular" />
      {children}
    </button>
  );
}

function StatusPill({ status }: { status: string }) {
  const failed = status === "failed";
  const done = status === "completed";
  return (
    <span
      className={`inline-flex items-center gap-2 rounded-pills border px-3 py-1.5 text-caption font-medium uppercase tracking-[0.06em] ${
        failed
          ? "border-red-400 bg-red-500/10 text-red-300"
          : done
            ? "border-mint-edge bg-mint-wash/10 text-mint-edge"
            : "border-lime-sprint bg-lime-sprint/15 text-lime-sprint"
      }`}
    >
      <span className={`size-2 rounded-full ${failed ? "bg-red-400" : done ? "bg-mint-edge" : "bg-lime-sprint"}`} />
      {STATUS_LABEL[status] ?? status}
    </span>
  );
}

function Retry({ id }: { id: string }) {
  async function retry() {
    const res = await fetch(`/api/generations/${id}/retry`, { method: "POST" });
    const json = await res.json();
    if (json.jobId) location.href = `/generations/${json.jobId}`;
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
