/**
 * Reconciles the local `docrivo` database against the row counts recorded from the
 * InsForge production dump, and proves the imported rows are usable rather than
 * merely present.
 *
 * Why this file exists instead of a one-off shell command: the recorded baseline
 * lived in `backup/row-counts-before.json`, inside a directory of plaintext
 * production data -- email addresses, password hashes, payment records, audit IPs
 * -- that the cutover deleted. A count that was only ever checked in a terminal
 * scrollback dies with the terminal, so the expectation is embedded here as a
 * constant and the check is re-runnable against a database that no longer has the
 * dump beside it.
 *
 * Two failure modes are checked, because either one alone is not an import:
 *
 *   1. Counts. Every table must hold exactly the production row count. A count
 *      that matches while the rows are unusable is still a failed import.
 *   2. Reference integrity. Every non-null `user_id` in the nine tables that carry
 *      one must resolve to a row in `users`, and every `job_id`, `page_id`,
 *      `retry_of` and `plan` must resolve to its parent. The declared foreign keys
 *      already guarantee this at insert time, which is the point: an import run
 *      with constraints dropped would sail through a count check and leave
 *      orphan rows behind, and only this catches it.
 *
 * The `users` count and its `email_verified` flags are checked too, because the
 * identity policy depends on them. The two pre-migration user ids are recorded in
 * the now-deleted `backup/identity-reference.json`; they are deliberately not
 * committed here, since a stable production user id is an identifier. The
 * durable guarantee is stated structurally instead: exactly 2 users, 2 distinct
 * emails, every one `email_verified`, and zero unresolvable references.
 *
 * Exits non-zero on any failure, so it is usable as a gate.
 *
 *   node scripts/reconcile-import.mjs
 */

import { config } from "dotenv"
import postgres from "postgres"

config({ path: [".env.local", ".env"], quiet: true })

/**
 * Row counts of the eleven application tables in the InsForge production dump,
 * 2191 rows in total. Recorded in `backup/row-counts-before.json`, which the
 * cutover deleted along with the rest of `backup/`. The dump itself holds one COPY
 * block per table and no INSERT statements, so these are exact, not estimates.
 *
 * `scrape_artifacts` is genuinely 0 on both sides: the table was empty in
 * production, and the dump's `storage.objects` block is also empty, so there were
 * never any screenshot bytes to carry either.
 */
const EXPECTED_COUNTS = {
  generation_jobs: 50,
  crawled_pages: 118,
  extracted_assets: 1820,
  design_extractions: 23,
  generated_documents: 22,
  job_logs: 113,
  rate_limits: 36,
  scrape_artifacts: 0,
  plans: 4,
  user_entitlements: 2,
  payment_transactions: 3,
}

const EXPECTED_TOTAL = 2191
const EXPECTED_USERS = 2

/**
 * One row per reference path, as [table, column, parent table, nullable].
 * `nullable` means the check only considers rows where the column is not null;
 * ownerless rows are legal here, and production has thousands of them -- 44 of the
 * 50 jobs predate the login requirement. Treating a null owner as a failure would
 * mean the import could never reconcile against a database that was correct.
 */
const REFERENCES = [
  ["generation_jobs", "user_id", "users", true],
  ["crawled_pages", "user_id", "users", true],
  ["extracted_assets", "user_id", "users", true],
  ["design_extractions", "user_id", "users", true],
  ["generated_documents", "user_id", "users", true],
  ["job_logs", "user_id", "users", true],
  ["user_entitlements", "user_id", "users", false],
  ["payment_transactions", "user_id", "users", false],
  ["scrape_artifacts", "user_id", "users", false],
  ["crawled_pages", "job_id", "generation_jobs", false],
  ["extracted_assets", "job_id", "generation_jobs", false],
  ["design_extractions", "job_id", "generation_jobs", false],
  ["generated_documents", "job_id", "generation_jobs", false],
  ["job_logs", "job_id", "generation_jobs", false],
  ["extracted_assets", "page_id", "crawled_pages", true],
  ["generation_jobs", "retry_of", "generation_jobs", true],
  ["user_entitlements", "plan", "plans", false],
  ["payment_transactions", "plan", "plans", false],
]

const failures = []

function check(ok, label, detail) {
  if (ok) {
    console.log(`  ok    ${label}${detail ? ` -- ${detail}` : ""}`)
  } else {
    console.log(`  FAIL  ${label}${detail ? ` -- ${detail}` : ""}`)
    failures.push(label)
  }
}

const url = process.env.DATABASE_URL
if (!url) {
  console.error("DATABASE_URL is required")
  process.exit(2)
}

const sql = postgres(url, { max: 1 })

try {
  const database = (await sql`select current_database() as name`)[0].name
  console.log(`reconciling ${database}\n`)

  console.log("row counts against the production baseline")
  let total = 0
  for (const [table, expected] of Object.entries(EXPECTED_COUNTS)) {
    const [{ count }] = await sql.unsafe(
      `select count(*)::int as count from public."${table}"`,
    )
    total += count
    check(
      count === expected,
      `${table} = ${expected}`,
      count === expected ? null : `found ${count}`,
    )
  }
  check(
    total === EXPECTED_TOTAL,
    `total = ${EXPECTED_TOTAL}`,
    total === EXPECTED_TOTAL ? null : `found ${total}`,
  )

  console.log("\nreference integrity (zero dangling rows required)")
  for (const [table, column, parent, nullable] of REFERENCES) {
    const where = nullable ? `where t."${column}" is not null` : ""
    // Every parent except `plans` is keyed by `id`; the plan catalogue by `plan`.
    const key = parent === "plans" ? "plan" : "id"
    const [{ dangling, refs }] = await sql.unsafe(`
      select
        count(*) filter (where p."${key}" is null)::int as dangling,
        count(*)::int as refs
      from public."${table}" t
      left join public."${parent}" p on p."${key}" = t."${column}"
      ${where}
    `)
    check(
      dangling === 0,
      `${table}.${column} -> ${parent}`,
      dangling === 0 ? `${refs} reference(s)` : `${dangling} of ${refs} dangle`,
    )
  }

  console.log("\nimported identities")
  const [users] = await sql`
    select
      count(*)::int as total,
      count(distinct email)::int as distinct_emails,
      count(*) filter (where email_verified)::int as verified,
      count(*) filter (where image is null)::int as no_image,
      count(*) filter (where name is null or name = '')::int as unnamed
    from public.users
  `
  check(
    users.total === EXPECTED_USERS,
    `users = ${EXPECTED_USERS}`,
    users.total === EXPECTED_USERS ? null : `found ${users.total}`,
  )
  check(
    users.distinct_emails === users.total,
    "every user has a distinct email",
    `${users.distinct_emails} distinct of ${users.total}`,
  )
  // Load-bearing, not cosmetic. Better Auth's implicit account linking on a Google
  // sign-in that matches an existing email requires the *local* row to be
  // email_verified (`accountLinking.requireLocalEmailVerified` defaults to true).
  // A false here means the first sign-in is rejected as `account not linked`, a new
  // user id is issued, and every job, entitlement and payment for that account
  // becomes ownerless. The import copies the old email_verified flag precisely
  // because of this.
  check(
    users.verified === users.total,
    "every user is email_verified (required for account linking)",
    `${users.verified} of ${users.total} verified`,
  )
  check(users.unnamed === 0, "every user has a name", `named: ${users.total - users.unnamed}`)
  check(
    users.no_image === users.total,
    "no user carries a migrated avatar (recorded policy: image stays null)",
    `${users.no_image} null`,
  )

  console.log("\ntables that must stay empty after the cutover")
  for (const table of ["account", "session", "verification"]) {
    const [{ count }] = await sql.unsafe(`select count(*)::int as count from public."${table}"`)
    check(count === 0, `${table} = 0`, count === 0 ? null : `found ${count}`)
  }
} finally {
  await sql.end()
}

console.log("")
if (failures.length > 0) {
  console.error(`${failures.length} check(s) failed: ${failures.join(", ")}`)
  process.exit(1)
}
console.log("all checks passed")
