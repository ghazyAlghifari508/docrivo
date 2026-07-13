// Client-side storage for currently active job/scrape IDs.
// Intentional: result UI is session-only. Refresh/hard refresh/reopen should
// start clean, while tab switching keeps in-memory state.

const ACTIVE_SCRAPE = "docrivo:active:scrape:v1";

function writeActive(key: string, value: string): void {
  if (typeof window === "undefined") return;
  try {
    if (value) window.sessionStorage.setItem(key, value);
    else window.sessionStorage.removeItem(key);
  } catch {
    /* best-effort */
  }
}

export const setActiveScrapeId = (id: string) => writeActive(ACTIVE_SCRAPE, id);
