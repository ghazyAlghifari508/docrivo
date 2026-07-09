// Client-side history of scrapes and DESIGN.md generations. Kept in localStorage
// because both flows are anonymous (no auth), so per-browser is the right scope.

export type HistoryKind = "scrape" | "generate";

export type HistoryEntry = {
  id: string;
  kind: HistoryKind;
  url: string;
  jobId?: string; // generate: links to /generations/[id]
  at: number;
};

const KEY = "docrivo:history:v1";
const MAX = 50;

function read(): HistoryEntry[] {
  if (typeof window === "undefined") return [];
  try {
    const raw = window.localStorage.getItem(KEY);
    const list = raw ? (JSON.parse(raw) as HistoryEntry[]) : [];
    return Array.isArray(list) ? list : [];
  } catch {
    return [];
  }
}

export function getHistory(): HistoryEntry[] {
  return read();
}

export function pushHistory(entry: { kind: HistoryKind; url: string; jobId?: string }): void {
  if (typeof window === "undefined") return;
  const item: HistoryEntry = {
    id: `${entry.kind}-${Date.now()}-${Math.random().toString(36).slice(2, 8)}`,
    kind: entry.kind,
    url: entry.url,
    jobId: entry.jobId,
    at: Date.now(),
  };
  const next = [item, ...read()].slice(0, MAX);
  try {
    window.localStorage.setItem(KEY, JSON.stringify(next));
    window.dispatchEvent(new CustomEvent("docrivo:history"));
  } catch {
    /* quota / disabled storage — history is best-effort */
  }
}

export function clearHistory(): void {
  if (typeof window === "undefined") return;
  try {
    window.localStorage.removeItem(KEY);
    window.dispatchEvent(new CustomEvent("docrivo:history"));
  } catch {
    /* ignore */
  }
}
