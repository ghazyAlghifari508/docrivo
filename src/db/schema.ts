/**
 * Application tables, mirroring the local PostgreSQL 17 schema as it stands
 * after the applied migrations: the baseline `migrations/0001`–`0008`, plus
 * `0011_user_fks.sql`, whose nine `user_id` foreign keys are declared below.
 * `0010_function_revoke.sql` is applied too, but it only revokes privileges on
 * three functions, so nothing here comes from it. `0009` is absent on purpose —
 * it is reserved for `0009_job_lease.sql`. `migrations/RULES.md` is
 * authoritative on the numbering. Types, nullability, defaults, indexes and
 * foreign keys are transcribed from the database itself; changing anything here
 * is a schema change and belongs in a new `migrations/` file, not in this file.
 *
 * One deliberate gap, awaiting a later task: `src/db/schema-auth.ts` (Better
 * Auth's user/session/account/verification tables) is not defined here. The nine
 * `user_id` foreign keys that the baseline had to drop are present, added by
 * `migrations/0011_user_fks.sql`; only two of the nine carry `on delete
 * cascade`, and that asymmetry is deliberate — read it from the production dump,
 * not from the InsForge migration files, where six of the nine are inline in
 * `add column` and the delete rule is invisible.
 *
 * `drizzle-kit generate` reports every index as changed, because a snapshot
 * taken by `drizzle-kit pull` records each index column's operator class and a
 * TypeScript definition cannot. The emitted `CREATE INDEX` statements are
 * identical to the live ones — verified against `pg_indexes` — so that diff is
 * noise and must not be applied.
 *
 * Constraint names are therefore written out: they are all PostgreSQL defaults,
 * and letting drizzle generate them would rename every foreign key and the
 * unique constraint on `payment_transactions.order_id`.
 */
import { sql } from "drizzle-orm"
import {
  boolean,
  foreignKey,
  index,
  integer,
  jsonb,
  pgTable,
  real,
  text,
  timestamp,
  unique,
  uniqueIndex,
  uuid,
} from "drizzle-orm/pg-core"
import { users } from "./schema-auth"

const createdAt = () => timestamp("created_at", { withTimezone: true }).notNull().defaultNow()

const updatedAt = () => timestamp("updated_at", { withTimezone: true }).notNull().defaultNow()

export const generationJobs = pgTable(
  "generation_jobs",
  {
    id: uuid("id")
      .primaryKey()
      .default(sql`gen_random_uuid()`)
      .notNull(),
    sessionId: text("session_id"),
    sourceUrl: text("source_url").notNull(),
    normalizedDomain: text("normalized_domain").notNull(),
    status: text("status").notNull().default("queued"),
    progress: integer("progress").notNull().default(0),
    maxPages: integer("max_pages").notNull().default(5),
    outputLanguage: text("output_language").notNull().default("id"),
    errorCode: text("error_code"),
    errorMessage: text("error_message"),
    /** One retry per source job, enforced by the partial unique index below. */
    retryOf: uuid("retry_of"),
    pagesAnalyzed: integer("pages_analyzed").notNull().default(0),
    startedAt: timestamp("started_at", { withTimezone: true }),
    completedAt: timestamp("completed_at", { withTimezone: true }),
    /**
     * When the worker holding this job stopped refreshing it. `null` unless the
     * status is a mid-flight one -- the claim sets it, the heartbeat extends it,
     * and `reclaim_expired_jobs()` clears it on the way back to the queue.
     *
     * Not `notNull`, and not defaulted: a `queued` row has no owner, and a
     * `running` row written before `migrations/0009_job_lease.sql` has no
     * expiry either. Both are "no lease", which the reclaim reads as "fall back
     * to `updated_at`" rather than as "expired".
     */
    leaseExpiresAt: timestamp("lease_expires_at", { withTimezone: true }),
    createdAt: createdAt(),
    updatedAt: updatedAt(),
    userId: uuid("user_id"),
  },
  (t) => [
    foreignKey({
      columns: [t.retryOf],
      foreignColumns: [t.id],
      name: "generation_jobs_retry_of_fkey",
    }).onDelete("cascade"),
    foreignKey({
      columns: [t.userId],
      foreignColumns: [users.id],
      name: "generation_jobs_user_id_fkey",
    }).onDelete("cascade"),
    // `desc` alone means NULLS FIRST in PostgreSQL; drizzle's default is
    // NULLS LAST, so both orderings below state it.
    index("generation_jobs_session_id_created_at_idx").on(
      t.sessionId,
      t.createdAt.desc().nullsFirst(),
    ),
    index("generation_jobs_status_idx").on(t.status),
    // Partial, and the predicate is the *deparsed* spelling because that is what
    // `pg_get_expr` returns and what `schema.test.ts` compares. `midflight_statuses()`
    // is unqualified here for the same reason: the deparser resolves it against
    // the search path and drops the `public.` the migration writes.
    index("generation_jobs_lease_idx")
      .on(t.leaseExpiresAt)
      .where(sql`(status = ANY (midflight_statuses()))`),
    index("idx_generation_jobs_retry_of").on(t.retryOf),
    index("idx_generation_jobs_user_id").on(t.userId),
    uniqueIndex("generation_jobs_retry_of_once")
      .on(t.retryOf)
      .where(sql`(retry_of IS NOT NULL)`),
  ],
)

export const crawledPages = pgTable(
  "crawled_pages",
  {
    id: uuid("id")
      .primaryKey()
      .default(sql`gen_random_uuid()`)
      .notNull(),
    jobId: uuid("job_id").notNull(),
    url: text("url").notNull(),
    title: text("title"),
    statusCode: integer("status_code"),
    screenshotDesktopUrl: text("screenshot_desktop_url"),
    screenshotMobileUrl: text("screenshot_mobile_url"),
    createdAt: createdAt(),
    userId: uuid("user_id"),
  },
  (t) => [
    foreignKey({
      columns: [t.jobId],
      foreignColumns: [generationJobs.id],
      name: "crawled_pages_job_id_fkey",
    }).onDelete("cascade"),
    foreignKey({
      columns: [t.userId],
      foreignColumns: [users.id],
      name: "crawled_pages_user_id_fkey",
    }),
    index("crawled_pages_job_id_idx").on(t.jobId),
    index("idx_crawled_pages_user_id").on(t.userId),
  ],
)

export const extractedAssets = pgTable(
  "extracted_assets",
  {
    id: uuid("id")
      .primaryKey()
      .default(sql`gen_random_uuid()`)
      .notNull(),
    jobId: uuid("job_id").notNull(),
    /** Null once the parent page is deleted. */
    pageId: uuid("page_id"),
    assetType: text("asset_type").notNull(),
    sourceUrl: text("source_url").notNull(),
    storageUrl: text("storage_url"),
    filename: text("filename"),
    sizeBytes: integer("size_bytes"),
    mimeType: text("mime_type"),
    status: text("status").notNull().default("found"),
    createdAt: createdAt(),
    userId: uuid("user_id"),
  },
  (t) => [
    foreignKey({
      columns: [t.jobId],
      foreignColumns: [generationJobs.id],
      name: "extracted_assets_job_id_fkey",
    }).onDelete("cascade"),
    foreignKey({
      columns: [t.pageId],
      foreignColumns: [crawledPages.id],
      name: "extracted_assets_page_id_fkey",
    }).onDelete("set null"),
    foreignKey({
      columns: [t.userId],
      foreignColumns: [users.id],
      name: "extracted_assets_user_id_fkey",
    }),
    index("extracted_assets_job_id_idx").on(t.jobId),
    index("idx_extracted_assets_page_id").on(t.pageId),
    index("idx_extracted_assets_user_id").on(t.userId),
  ],
)

export const designExtractions = pgTable(
  "design_extractions",
  {
    id: uuid("id")
      .primaryKey()
      .default(sql`gen_random_uuid()`)
      .notNull(),
    jobId: uuid("job_id").notNull(),
    colors: jsonb("colors"),
    typography: jsonb("typography"),
    layoutPatterns: jsonb("layout_patterns"),
    components: jsonb("components"),
    metadata: jsonb("metadata"),
    /** Model confidence between 0 and 1 — `real`, so fractions survive. */
    confidenceScore: real("confidence_score"),
    createdAt: createdAt(),
    userId: uuid("user_id"),
  },
  (t) => [
    foreignKey({
      columns: [t.jobId],
      foreignColumns: [generationJobs.id],
      name: "design_extractions_job_id_fkey",
    }).onDelete("cascade"),
    foreignKey({
      columns: [t.userId],
      foreignColumns: [users.id],
      name: "design_extractions_user_id_fkey",
    }),
    index("design_extractions_job_id_idx").on(t.jobId),
    index("idx_design_extractions_user_id").on(t.userId),
  ],
)

export const generatedDocuments = pgTable(
  "generated_documents",
  {
    id: uuid("id")
      .primaryKey()
      .default(sql`gen_random_uuid()`)
      .notNull(),
    jobId: uuid("job_id").notNull(),
    designMd: text("design_md"),
    implementationPrompt: text("implementation_prompt"),
    createdAt: createdAt(),
    updatedAt: updatedAt(),
    userId: uuid("user_id"),
  },
  (t) => [
    foreignKey({
      columns: [t.jobId],
      foreignColumns: [generationJobs.id],
      name: "generated_documents_job_id_fkey",
    }).onDelete("cascade"),
    foreignKey({
      columns: [t.userId],
      foreignColumns: [users.id],
      name: "generated_documents_user_id_fkey",
    }),
    index("generated_documents_job_id_idx").on(t.jobId),
    index("idx_generated_documents_user_id").on(t.userId),
  ],
)

export const jobLogs = pgTable(
  "job_logs",
  {
    id: uuid("id")
      .primaryKey()
      .default(sql`gen_random_uuid()`)
      .notNull(),
    jobId: uuid("job_id").notNull(),
    level: text("level").notNull().default("info"),
    event: text("event"),
    message: text("message"),
    context: jsonb("context"),
    createdAt: createdAt(),
    userId: uuid("user_id"),
  },
  (t) => [
    foreignKey({
      columns: [t.jobId],
      foreignColumns: [generationJobs.id],
      name: "job_logs_job_id_fkey",
    }).onDelete("cascade"),
    foreignKey({
      columns: [t.userId],
      foreignColumns: [users.id],
      name: "job_logs_user_id_fkey",
    }),
    index("job_logs_job_id_created_at_idx").on(t.jobId, t.createdAt),
    index("idx_job_logs_user_id").on(t.userId),
  ],
)

/** Keyed by the rate-limit bucket name; there is no surrogate `id`. */
export const rateLimits = pgTable("rate_limits", {
  key: text("key")
    .primaryKey()
    .notNull(),
  count: integer("count").notNull().default(0),
  resetAt: timestamp("reset_at", { withTimezone: true }).notNull(),
  updatedAt: updatedAt(),
})

export const scrapeArtifacts = pgTable(
  "scrape_artifacts",
  {
    id: uuid("id")
      .primaryKey()
      .default(sql`gen_random_uuid()`)
      .notNull(),
    userId: uuid("user_id").notNull(),
    sourceUrl: text("source_url").notNull(),
    /** HTTP status of the fetched page, e.g. 200 or 404 — not a state name. */
    status: integer("status").notNull().default(200),
    /** Full page markup, so `text` and not `varchar`; reaches ~6 MB. */
    html: text("html").notNull(),
    /** Asset-rewritten markup for the sandboxed preview frame. */
    previewHtml: text("preview_html").notNull(),
    metadata: jsonb("metadata")
      .notNull()
      .default(sql`'{}'::jsonb`),
    createdAt: createdAt(),
  },
  (t) => [
    foreignKey({
      columns: [t.userId],
      foreignColumns: [users.id],
      name: "scrape_artifacts_user_id_fkey",
    }).onDelete("cascade"),
    index("idx_scrape_artifacts_user_id").on(t.userId, t.createdAt.desc().nullsFirst()),
  ],
)

/** Plan catalogue, keyed by plan name; there is no surrogate `id`. */
export const plans = pgTable("plans", {
  plan: text("plan")
    .primaryKey()
    .notNull(),
  label: text("label").notNull(),
  /** A null quota means unlimited. */
  designmdQuota: integer("designmd_quota"),
  scrapeQuota: integer("scrape_quota"),
  templatesUnlocked: boolean("templates_unlocked").notNull().default(false),
  priceIdr: integer("price_idr").notNull().default(0),
  sortOrder: integer("sort_order").notNull().default(0),
})

/** One row per user, keyed by `user_id`; there is no surrogate `id`. */
export const userEntitlements = pgTable(
  "user_entitlements",
  {
    userId: uuid("user_id")
      .primaryKey()
      .notNull(),
    plan: text("plan")
      .notNull()
      .default("free"),
    designmdUsed: integer("designmd_used").notNull().default(0),
    scrapeUsed: integer("scrape_used").notNull().default(0),
    createdAt: createdAt(),
    updatedAt: updatedAt(),
  },
  (t) => [
    foreignKey({
      columns: [t.plan],
      foreignColumns: [plans.plan],
      name: "user_entitlements_plan_fkey",
    }),
    foreignKey({
      columns: [t.userId],
      foreignColumns: [users.id],
      name: "user_entitlements_user_id_fkey",
    }),
    index("idx_user_entitlements_plan").on(t.plan),
  ],
)

export const paymentTransactions = pgTable(
  "payment_transactions",
  {
    id: uuid("id")
      .primaryKey()
      .default(sql`gen_random_uuid()`)
      .notNull(),
    userId: uuid("user_id").notNull(),
    orderId: text("order_id").notNull(),
    plan: text("plan").notNull(),
    /** Whole Indonesian rupiah, so an integer: there are no cents. */
    grossAmount: integer("gross_amount").notNull(),
    status: text("status").notNull().default("pending"),
    createdAt: createdAt(),
    updatedAt: updatedAt(),
  },
  (t) => [
    foreignKey({
      columns: [t.plan],
      foreignColumns: [plans.plan],
      name: "payment_transactions_plan_fkey",
    }),
    foreignKey({
      columns: [t.userId],
      foreignColumns: [users.id],
      name: "payment_transactions_user_id_fkey",
    }),
    unique("payment_transactions_order_id_key").on(t.orderId),
    index("idx_payment_transactions_user_id").on(t.userId),
    index("idx_payment_transactions_plan").on(t.plan),
  ],
)
