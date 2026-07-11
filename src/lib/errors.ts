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
