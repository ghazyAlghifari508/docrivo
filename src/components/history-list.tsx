"use client";

import Link from "next/link";
import { useEffect, useState } from "react";
import { ArrowRight, Code, FileMd, GlobeHemisphereWest, Trash } from "@phosphor-icons/react";
import { getHistory, clearHistory, type HistoryEntry } from "@/lib/history";

function timeAgo(ts: number): string {
  const s = Math.floor((Date.now() - ts) / 1000);
  if (s < 60) return "baru saja";
  const m = Math.floor(s / 60);
  if (m < 60) return `${m} menit lalu`;
  const h = Math.floor(m / 60);
  if (h < 24) return `${h} jam lalu`;
  return `${Math.floor(h / 24)} hari lalu`;
}

export function HistoryList() {
  const [items, setItems] = useState<HistoryEntry[] | null>(null);

  useEffect(() => {
    const sync = () => setItems(getHistory());
    sync();
    window.addEventListener("docrivo:history", sync);
    window.addEventListener("storage", sync);
    return () => {
      window.removeEventListener("docrivo:history", sync);
      window.removeEventListener("storage", sync);
    };
  }, []);

  if (items === null) {
    return <p className="text-body-sm text-muted-gray">Memuat riwayat…</p>;
  }

  if (!items.length) {
    return (
      <div className="rounded-cards border border-rule bg-cream p-8 text-center">
        <p className="text-body-sm font-medium text-ink">Belum ada riwayat.</p>
        <p className="mt-2 text-caption text-muted-gray">
          Scrape HTML atau generate DESIGN.md dulu, riwayatnya akan muncul di sini.
        </p>
        <Link
          href="/"
          className="pressable mt-6 inline-flex h-11 items-center gap-2 rounded-buttons border border-ink bg-lime-sprint px-5 text-body-sm font-medium text-ink shadow-hard"
        >
          Mulai sekarang <ArrowRight size={16} weight="bold" aria-hidden="true" />
        </Link>
      </div>
    );
  }

  return (
    <div>
      <div className="mb-4 flex items-center justify-between">
        <span className="text-caption text-muted-gray">{items.length} riwayat tersimpan di browser ini</span>
        <button
          onClick={() => clearHistory()}
          className="inline-flex items-center gap-1.5 rounded-buttons border border-ink bg-paper-white px-3 py-1.5 text-caption font-medium text-ink shadow-hard"
        >
          <Trash size={14} /> Hapus semua
        </button>
      </div>

      <ul className="space-y-3">
        {items.map((it) => (
          <li key={it.id}>
            <HistoryRow entry={it} />
          </li>
        ))}
      </ul>
    </div>
  );
}

function HistoryRow({ entry }: { entry: HistoryEntry }) {
  const isScrape = entry.kind === "scrape";
  const inner = (
    <div className="flex items-center gap-3 rounded-cards border border-ink bg-paper-white p-4 shadow-hard">
      <span className="grid size-10 shrink-0 place-items-center rounded-buttons border border-ink bg-lime-sprint">
        {isScrape ? <Code size={18} weight="fill" aria-hidden="true" /> : <FileMd size={18} weight="fill" aria-hidden="true" />}
      </span>
      <div className="min-w-0 flex-1">
        <p className="flex items-center gap-1.5 text-caption font-semibold uppercase tracking-[0.06em] text-muted">
          {isScrape ? "Scrape HTML" : "Generate DESIGN.md"}
        </p>
        <p className="mt-0.5 flex items-center gap-1.5 truncate text-body-sm font-medium text-ink">
          <GlobeHemisphereWest size={14} className="shrink-0 text-muted-gray" aria-hidden="true" />
          <span className="truncate">{entry.url}</span>
        </p>
      </div>
      <span className="shrink-0 text-caption text-muted-gray">{timeAgo(entry.at)}</span>
      {(!isScrape && entry.jobId) || (isScrape && entry.scrapeId) ? <ArrowRight size={16} className="shrink-0 text-muted" aria-hidden="true" /> : null}
    </div>
  );

  if (isScrape && entry.scrapeId) {
    return <Link href={`/history/scrapes/${entry.scrapeId}`}>{inner}</Link>;
  }
  if (!isScrape && entry.jobId) {
    return <Link href={`/generations/${entry.jobId}`}>{inner}</Link>;
  }
  return inner;
}
