/**
 * Retry a fn on transient infra failures. Network blips, InsForge schema cache
 * reloads (PGRST002), and 502/503/504 from the API proxy self-heal within a
 * few seconds. AppError is non-transient and propagates immediately.
 *
 * Used ONLY for safe-to-retry calls (idempotent or compensation-style, like
 * `refund_quota` — never for inserts/updates that could double-write).
 */
export function isTransient(err: unknown): boolean {
  if (!err) return false;
  const msg = err instanceof Error ? err.message : String(err);
  if (/socket hang up|ECONNRESET|ECONNREFUSED|ETIMEDOUT|ENOTFOUND/i.test(msg)) return true;
  if (/\bPGRST002\b/.test(msg)) return true;
  if (/\bfailed 502\b|\bfailed 503\b|\bfailed 504\b|\bINTERNAL_ERROR\b/.test(msg)) return true;
  return false;
}

export async function retryTransient<T>(
  fn: () => Promise<T>,
  opts: { retries?: number; baseMs?: number } = {},
): Promise<T> {
  const { retries = 3, baseMs = 200 } = opts;
  let last: unknown;
  for (let attempt = 0; attempt <= retries; attempt += 1) {
    try {
      return await fn();
    } catch (err) {
      last = err;
      if (!isTransient(err) || attempt === retries) throw err;
      // ponytail: short exponential backoff — InsForge schema cache usually
      // recovers in <1s; 200/400/800/1600 covers it without blocking too long.
      await new Promise((r) => setTimeout(r, baseMs * 2 ** attempt));
    }
  }
  throw last;
}
