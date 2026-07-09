// Client-side history of scrapes and DESIGN.md generations. Kept in browser storage
// because both flows are anonymous (no auth), so per-browser is the right scope.

export type HistoryKind = "scrape" | "generate";

export type HistoryEntry = {
  id: string;
  kind: HistoryKind;
  url: string;
  jobId?: string; // generate: links to /generations/[id]
  scrapeId?: string; // scrape: links to /history/scrapes/[id]
  at: number;
};

export type ScrapeArtifact = {
  id: string;
  sourceUrl: string;
  status: number;
  html: string;
  previewHtml: string;
  metadata: {
    attempt: number;
    capturedAt: string;
    finalUrl: string;
    viewport: { width: number; height: number };
    captureMode: string;
    htmlBytes: number;
    previewHtmlBytes: number;
  };
  at: number;
};

const KEY = "docrivo:history:v1";
const SCRAPE_KEY = "docrivo:scrapes:v1";
const ACTIVE_JOB = "docrivo:active:job:v1";
const ACTIVE_SCRAPE = "docrivo:active:scrape:v1";
const DB_NAME = "docrivo-history:v1";
const SCRAPE_STORE = "scrapes";
const MAX = 50;

// The currently displayed output on the home page. Persisted so navigating away
// and back (or reloading) keeps the last result until the user makes a new one.
function readActive(key: string): string {
  if (typeof window === "undefined") return "";
  try {
    return window.localStorage.getItem(key) ?? "";
  } catch {
    return "";
  }
}

function writeActive(key: string, value: string): void {
  if (typeof window === "undefined") return;
  try {
    if (value) window.localStorage.setItem(key, value);
    else window.localStorage.removeItem(key);
  } catch {
    /* best-effort */
  }
}

export const getActiveJobId = () => readActive(ACTIVE_JOB);
export const setActiveJobId = (id: string) => writeActive(ACTIVE_JOB, id);
export const getActiveScrapeId = () => readActive(ACTIVE_SCRAPE);
export const setActiveScrapeId = (id: string) => writeActive(ACTIVE_SCRAPE, id);

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

export function pushHistory(entry: { kind: HistoryKind; url: string; jobId?: string; scrapeId?: string }): void {
  if (typeof window === "undefined") return;
  const item: HistoryEntry = {
    id: `${entry.kind}-${Date.now()}-${Math.random().toString(36).slice(2, 8)}`,
    kind: entry.kind,
    url: entry.url,
    jobId: entry.jobId,
    scrapeId: entry.scrapeId,
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

function readScrapes(): ScrapeArtifact[] {
  if (typeof window === "undefined") return [];
  try {
    const raw = window.localStorage.getItem(SCRAPE_KEY);
    const list = raw ? (JSON.parse(raw) as ScrapeArtifact[]) : [];
    return Array.isArray(list) ? list : [];
  } catch {
    return [];
  }
}

function openScrapeDb(): Promise<IDBDatabase> {
  return new Promise((resolve, reject) => {
    const req = window.indexedDB.open(DB_NAME, 1);
    req.onupgradeneeded = () => req.result.createObjectStore(SCRAPE_STORE, { keyPath: "id" });
    req.onsuccess = () => resolve(req.result);
    req.onerror = () => reject(req.error);
  });
}

async function idbPut(item: ScrapeArtifact): Promise<void> {
  const db = await openScrapeDb();
  await new Promise<void>((resolve, reject) => {
    const tx = db.transaction(SCRAPE_STORE, "readwrite");
    tx.objectStore(SCRAPE_STORE).put(item);
    tx.oncomplete = () => resolve();
    tx.onerror = () => reject(tx.error);
  });
  db.close();
}

async function idbGet(id: string): Promise<ScrapeArtifact | null> {
  const db = await openScrapeDb();
  const item = await new Promise<ScrapeArtifact | null>((resolve, reject) => {
    const req = db.transaction(SCRAPE_STORE).objectStore(SCRAPE_STORE).get(id);
    req.onsuccess = () => resolve((req.result as ScrapeArtifact | undefined) ?? null);
    req.onerror = () => reject(req.error);
  });
  db.close();
  return item;
}

function saveScrapeArtifactFallback(item: ScrapeArtifact): boolean {
  try {
    window.localStorage.setItem(SCRAPE_KEY, JSON.stringify([item, ...readScrapes()].slice(0, MAX)));
    return true;
  } catch {
    try {
      window.localStorage.setItem(SCRAPE_KEY, JSON.stringify([item]));
      return true;
    } catch {
      return false;
    }
  }
}

export async function saveScrapeArtifact(scrape: Omit<ScrapeArtifact, "id" | "at">): Promise<string | null> {
  const id = `scrape-${Date.now()}-${Math.random().toString(36).slice(2, 8)}`;
  if (typeof window === "undefined") return id;
  const item: ScrapeArtifact = { ...scrape, id, at: Date.now() };
  try {
    await idbPut(item);
    return id;
  } catch {
    return saveScrapeArtifactFallback(item) ? id : null;
  }
}

export async function getScrapeArtifact(id: string): Promise<ScrapeArtifact | null> {
  if (typeof window === "undefined") return null;
  try {
    return (await idbGet(id)) ?? readScrapes().find((item) => item.id === id) ?? null;
  } catch {
    return readScrapes().find((item) => item.id === id) ?? null;
  }
}

export function removeHistoryEntry(id: string): void {
  if (typeof window === "undefined") return;
  const next = read().filter((h) => h.id !== id);
  try {
    window.localStorage.setItem(KEY, JSON.stringify(next));
    window.dispatchEvent(new CustomEvent("docrivo:history"));
  } catch {
    /* best-effort */
  }
}

export function clearHistory(): void {
  if (typeof window === "undefined") return;
  try {
    window.localStorage.removeItem(KEY);
    window.localStorage.removeItem(SCRAPE_KEY);
    window.localStorage.removeItem(ACTIVE_JOB);
    window.localStorage.removeItem(ACTIVE_SCRAPE);
    window.indexedDB?.deleteDatabase(DB_NAME);
    window.dispatchEvent(new CustomEvent("docrivo:history"));
  } catch {
    /* ignore */
  }
}
