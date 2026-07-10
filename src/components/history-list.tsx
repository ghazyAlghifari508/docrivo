"use client";

import Link from "next/link";
import { useState, useCallback } from "react";
import { ArrowRight, Code, FileMd, GlobeHemisphereWest, Trash, Warning } from "@phosphor-icons/react";

type GenerationItem = { id: string; url: string; status: string; at: number };
type ScrapeItem = { id: string; url: string; at: number };

const STATUS_LABEL: Record<string, string> = {
  queued: "Menunggu",
  crawling: "Membaca",
  capturing: "Menangkap",
  extracting: "Merangkum",
  generating: "Menyusun",
  completed: "Selesai",
  failed: "Gagal",
  cancelled: "Dibatalkan",
};

function timeAgo(ts: number): string {
  const s = Math.floor((Date.now() - ts) / 1000);
  if (s < 60) return "baru saja";
  const m = Math.floor(s / 60);
  if (m < 60) return `${m} menit lalu`;
  const h = Math.floor(m / 60);
  if (h < 24) return `${h} jam lalu`;
  return `${Math.floor(h / 24)} hari lalu`;
}

export function HistoryList({ generations, scrapes }: { generations: GenerationItem[]; scrapes: ScrapeItem[] }) {
  const [confirmDelete, setConfirmDelete] = useState<{ id: string; kind: "scrape" | "generate" } | null>(null);
  const [confirmClear, setConfirmClear] = useState(false);
  const [items, setItems] = useState<{ generations: GenerationItem[]; scrapes: ScrapeItem[] }>({
    generations,
    scrapes,
  });

  const total = items.generations.length + items.scrapes.length;

  const handleDelete = useCallback(async () => {
    if (!confirmDelete) return;
    const path = confirmDelete.kind === "scrape" ? `/api/scrapes/${confirmDelete.id}` : `/api/generations/${confirmDelete.id}`;
    const res = await fetch(path, { method: "DELETE" });
    if (res.ok) {
      setItems((prev) => ({
        generations: prev.generations.filter((g) => !(confirmDelete.kind === "generate" && g.id === confirmDelete.id)),
        scrapes: prev.scrapes.filter((s) => !(confirmDelete.kind === "scrape" && s.id === confirmDelete.id)),
      }));
    }
    setConfirmDelete(null);
  }, [confirmDelete]);

  const handleClear = useCallback(async () => {
    await Promise.all([
      ...items.generations.map((g) => fetch(`/api/generations/${g.id}`, { method: "DELETE" })),
      ...items.scrapes.map((s) => fetch(`/api/scrapes/${s.id}`, { method: "DELETE" })),
    ]);
    setItems({ generations: [], scrapes: [] });
    setConfirmClear(false);
  }, [items]);

  if (total === 0) {
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
        <span className="text-caption text-muted-gray">{total} riwayat tersimpan</span>
        <button
          onClick={() => setConfirmClear(true)}
          className="inline-flex items-center gap-1.5 rounded-buttons border border-ink bg-paper-white px-3 py-1.5 text-caption font-medium text-ink shadow-hard"
        >
          <Trash size={14} /> Hapus semua
        </button>
      </div>

      <ul className="space-y-3">
        {items.generations.map((it) => (
          <li key={it.id} className="group relative">
            <GenerationRow entry={it} onDelete={() => setConfirmDelete({ id: it.id, kind: "generate" })} />
          </li>
        ))}
        {items.scrapes.map((it) => (
          <li key={it.id} className="group relative">
            <ScrapeRow entry={it} onDelete={() => setConfirmDelete({ id: it.id, kind: "scrape" })} />
          </li>
        ))}
      </ul>

      {confirmDelete ? (
        <Modal
          title="Yakin ingin hapus riwayat ini?"
          onCancel={() => setConfirmDelete(null)}
          onConfirm={handleDelete}
        />
      ) : null}
      {confirmClear ? (
        <Modal
          title="Yakin ingin hapus semua riwayat?"
          onCancel={() => setConfirmClear(false)}
          onConfirm={handleClear}
        />
      ) : null}
    </div>
  );
}

function GenerationRow({ entry, onDelete }: { entry: GenerationItem; onDelete: () => void }) {
  return (
    <Link href={`/generations/${entry.id}`} className="flex items-center gap-3 rounded-cards border border-ink bg-paper-white p-4 shadow-hard">
      <span className="grid size-10 shrink-0 place-items-center rounded-buttons border border-ink bg-lime-sprint">
        <FileMd size={18} weight="fill" aria-hidden="true" />
      </span>
      <div className="min-w-0 flex-1">
        <p className="flex items-center gap-1.5 text-caption font-semibold uppercase tracking-[0.06em] text-muted">
          Generate DESIGN.md
          <span className="rounded-pills border border-rule px-2 py-0.5 text-[10px] text-muted-gray">
            {STATUS_LABEL[entry.status] ?? entry.status}
          </span>
        </p>
        <p className="mt-0.5 flex items-center gap-1.5 truncate text-body-sm font-medium text-ink">
          <GlobeHemisphereWest size={14} className="shrink-0 text-muted-gray" aria-hidden="true" />
          <span className="truncate">{entry.url}</span>
        </p>
      </div>
      <span className="shrink-0 text-caption text-muted-gray">{timeAgo(entry.at)}</span>
      <button
        aria-label="Hapus"
        onClick={(e) => { e.preventDefault(); e.stopPropagation(); onDelete(); }}
        className="shrink-0 text-muted-gray opacity-0 group-hover:text-red-500 group-hover:opacity-100 transition-opacity hover:text-red-500"
      >
        <Trash size={16} />
      </button>
      <ArrowRight size={16} className="shrink-0 text-muted" aria-hidden="true" />
    </Link>
  );
}

function ScrapeRow({ entry, onDelete }: { entry: ScrapeItem; onDelete: () => void }) {
  return (
    <Link href={`/history/scrapes/${entry.id}`} className="flex items-center gap-3 rounded-cards border border-ink bg-paper-white p-4 shadow-hard">
      <span className="grid size-10 shrink-0 place-items-center rounded-buttons border border-ink bg-lime-sprint">
        <Code size={18} weight="fill" aria-hidden="true" />
      </span>
      <div className="min-w-0 flex-1">
        <p className="flex items-center gap-1.5 text-caption font-semibold uppercase tracking-[0.06em] text-muted">
          Scrape HTML
        </p>
        <p className="mt-0.5 flex items-center gap-1.5 truncate text-body-sm font-medium text-ink">
          <GlobeHemisphereWest size={14} className="shrink-0 text-muted-gray" aria-hidden="true" />
          <span className="truncate">{entry.url}</span>
        </p>
      </div>
      <span className="shrink-0 text-caption text-muted-gray">{timeAgo(entry.at)}</span>
      <button
        aria-label="Hapus"
        onClick={(e) => { e.preventDefault(); e.stopPropagation(); onDelete(); }}
        className="shrink-0 text-muted-gray opacity-0 group-hover:text-red-500 group-hover:opacity-100 transition-opacity hover:text-red-500"
      >
        <Trash size={16} />
      </button>
      <ArrowRight size={16} className="shrink-0 text-muted" aria-hidden="true" />
    </Link>
  );
}

function Modal({ title, onCancel, onConfirm }: { title: string; onCancel: () => void; onConfirm: () => void }) {
  return (
    <div
      className="fixed inset-0 z-50 grid place-items-center bg-black/40 px-4"
      onClick={onCancel}
    >
      <div className="w-full max-w-sm rounded-cards border border-ink bg-paper-white p-6 shadow-hard-xl" onClick={(e) => e.stopPropagation()}>
        <span className="mx-auto grid size-12 place-items-center rounded-buttons border border-ink bg-cream shadow-hard">
          <Warning size={22} weight="fill" aria-hidden="true" />
        </span>
        <p className="mt-5 text-center text-body-sm font-semibold text-ink">{title}</p>
        <p className="mt-2 text-center text-caption text-muted-gray">Riwayat akan dihapus dari akun Google kamu dan tidak bisa dikembalikan.</p>
        <div className="mt-6 flex gap-3">
          <button onClick={onCancel} className="flex-1 rounded-buttons border border-ink bg-paper-white px-4 py-2.5 text-body-sm font-medium text-ink shadow-hard">
            Batal
          </button>
          <button onClick={onConfirm} className="flex-1 rounded-buttons border border-ink bg-red-500 px-4 py-2.5 text-body-sm font-medium text-paper-white shadow-hard">
            Hapus
          </button>
        </div>
      </div>
    </div>
  );
}
