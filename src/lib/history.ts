// Client-side storage for currently active job/scrape IDs.
// Persists so navigating away and back (or reloading) keeps the last result
// until the user makes a new one.

const ACTIVE_JOB = "docrivo:active:job:v1";
const ACTIVE_SCRAPE = "docrivo:active:scrape:v1";

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
