// App error codes - mirrors PRD §13. User-facing messages in Bahasa Indonesia.
export const ERROR_CODES = {
  INVALID_URL: "URL tidak valid. Masukkan URL website yang benar.",
  PRIVATE_URL_BLOCKED: "URL tidak dapat diproses karena alasan keamanan.",
  FETCH_TIMEOUT: "Website terlalu lama merespons. Coba lagi nanti.",
  WEBSITE_BLOCKED: "Website tidak dapat diakses oleh sistem.",
  NO_ANALYZABLE_CONTENT:
    "Sistem tidak menemukan konten yang cukup untuk dianalisis.",
  AI_GENERATION_FAILED: "Generate DESIGN.md gagal. Coba ulangi proses.",
  STORAGE_FAILED: "Terjadi kendala saat menyimpan hasil.",
  RATE_LIMITED: "Terlalu banyak percobaan. Coba lagi beberapa saat.",
  QUOTA_EXCEEDED: "Kredit kamu sudah habis. Upgrade paket untuk lanjut.",
  BACKEND_TRANSIENT: "Backend lagi sibuk, coba lagi dalam beberapa detik.",
} as const;

export type ErrorCode = keyof typeof ERROR_CODES;

export class AppError extends Error {
  constructor(
    public code: ErrorCode,
    message?: string,
    options?: ErrorOptions,
  ) {
    super(message ?? ERROR_CODES[code], options);
    this.name = "AppError";
  }
}

/**
 * The result shape every write server function returns.
 *
 * These functions answer with a value rather than throwing, because the caller
 * has to tell three failures apart -- signed out, out of credits, unusable URL
 * -- and each carries its own user-facing message from `ERROR_CODES`. A thrown
 * error arrives at the client as an opaque message, so the component could only
 * report "something went wrong" and would have to guess which case it was.
 *
 * `ok: true` is the discriminant, so the component narrows with a single
 * `if (!result.ok)` rather than an `in` check on a code.
 */
export type ActionFailure = {
  ok: false;
  error: { code: string; message: string };
};

export type ActionResult<T> = ({ ok: true } & T) | ActionFailure;

export function failure(code: string, message: string): ActionFailure {
  return { ok: false, error: { code, message } }
}

/**
 * A user-facing sentence for whatever reached a route's error boundary.
 *
 * `error.message` alone is wrong in two ways. A `Response` -- which is what
 * `requireUser` throws for a missing session -- has none, so the page would
 * render an empty paragraph. And a driver error carries a connection string,
 * which must not be printed into a page: `postgres` puts the DSN in its message,
 * and a DSN in rendered HTML is a credential leak.
 *
 * So only the codes this app raises deliberately are described, a message is
 * echoed only when it is short enough to be a human sentence rather than a stack
 * frame or a DSN, and everything else gets a fixed string.
 */
export function describeRouteError(error: unknown): string {
  if (error instanceof Response) {
    if (error.status === 401) return "Sesi kamu sudah berakhir. Masuk lagi untuk melanjutkan."
    if (error.status === 403) return "Kamu tidak punya akses ke halaman ini."
    return "Halaman ini tidak bisa dimuat. Coba lagi sebentar lagi."
  }

  const message = error instanceof Error ? error.message : ""
  return message.length > 0 && message.length <= 200
    ? message
    : "Terjadi kesalahan yang tidak terduga. Coba lagi sebentar lagi."
}
