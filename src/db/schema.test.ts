import { describe, expect, it } from "vitest"
import { isTable, SQL, sql } from "drizzle-orm"
import { getTableConfig, type PgTable } from "drizzle-orm/pg-core"
import { db, schema } from "./index"

const EXPECTED_TABLES = [
  "crawled_pages",
  "design_extractions",
  "extracted_assets",
  "generated_documents",
  "generation_jobs",
  "job_logs",
  "payment_transactions",
  "plans",
  "rate_limits",
  "scrape_artifacts",
  "user_entitlements",
]

/** Tables keyed by a business column, so no surrogate `id` exists at all. */
const NO_SURROGATE_PK_TABLES: Record<string, string> = {
  plans: "plan",
  rate_limits: "key",
  user_entitlements: "user_id",
}

const TABLE_LIST_SQL = EXPECTED_TABLES.map((t) => `'${t}'`).join(",")

type ColumnLike = {
  name: string
  getSQLType(): string
  notNull: boolean
  hasDefault: boolean
  default: unknown
}

type LiveColumn = {
  table_name: string
  column_name: string
  data_type: string
  is_nullable: "YES" | "NO"
  column_default: string | null
}

const configOf = (table: PgTable) => getTableConfig(table)

const allTables = (): PgTable[] =>
  Object.values(schema as Record<string, unknown>).filter(isTable) as PgTable[]

const tableConfigByName = () =>
  new Map(allTables().map((t) => [configOf(t).name, configOf(t)]))

const liveColumns = async () =>
  db.execute<LiveColumn>(sql.raw(`
    select table_name, column_name, data_type, is_nullable, column_default
    from information_schema.columns
    where table_schema = 'public' and table_name in (${TABLE_LIST_SQL})
  `))

/** `SQLChunk.value` holds string pieces; primitives carry their own value. */
const chunkText = (chunk: unknown): string => {
  if (typeof chunk === "object" && chunk !== null && "value" in chunk) {
    const inner = (chunk as { value: unknown }).value
    return Array.isArray(inner) ? inner.map(String).join("") : String(inner)
  }
  return String(chunk)
}

/**
 * Renders a Drizzle default to the same shape information_schema reports, so
 * `sql`gen_random_uuid()`` and the literal `'queued'` are both comparable with
 * `gen_random_uuid()` and `'queued'::text`.
 */
const defaultExpression = (column: ColumnLike): string | null => {
  if (!column.hasDefault) return null
  if (column.default instanceof SQL) {
    return column.default.queryChunks.map(chunkText).join("")
  }
  return String(column.default)
}

const normalizeDefault = (raw: string): string =>
  raw
    .replace(/::[a-z_ ]+/gi, "")
    .trim()
    .replace(/^'([\s\S]*)'$/, "$1")
    .replace(/^\(([\s\S]*)\)$/, "$1")
    .trim()

describe("local database", () => {
  it("has every application table", async () => {
    const rows = await db.execute<{ table_name: string }>(
      sql`select table_name from information_schema.tables
          where table_schema = 'public' and table_type = 'BASE TABLE'`,
    )
    const found = rows.map((r) => r.table_name)
    for (const t of EXPECTED_TABLES) expect(found).toContain(t)
  })

  it("resolves generation_jobs.user_id as a uuid column", async () => {
    const rows = await db.execute<{ data_type: string }>(
      sql`select data_type from information_schema.columns
          where table_name = 'generation_jobs' and column_name = 'user_id'`,
    )
    expect(rows[0]?.data_type).toBe("uuid")
  })
})

describe("drizzle schema", () => {
  it("defines every application table", () => {
    const defined = allTables().map((t) => configOf(t).name).sort()
    expect(defined).toEqual(EXPECTED_TABLES)
  })

  it("models generationJobs.userId as uuid", () => {
    const column = tableConfigByName().get("generation_jobs")?.columns.find(
      (c) => c.name === "user_id",
    ) as ColumnLike | undefined
    expect(column?.getSQLType()).toBe("uuid")
  })

  it("gives plans, rate_limits and user_entitlements no surrogate id column", () => {
    const configs = tableConfigByName()
    for (const [name, primaryKeyColumn] of Object.entries(NO_SURROGATE_PK_TABLES)) {
      const names = (configs.get(name)?.columns ?? []).map((c) => c.name)
      expect(names).toContain(primaryKeyColumn)
      expect(names).not.toContain("id")
    }
  })

  it("models scrape_artifacts.status as an integer http status, not text", () => {
    const column = tableConfigByName().get("scrape_artifacts")?.columns.find(
      (c) => c.name === "status",
    ) as ColumnLike | undefined
    expect(column?.getSQLType()).toBe("integer")
  })

  it("models design_extractions.confidence_score as real, not integer", () => {
    const column = tableConfigByName().get("design_extractions")?.columns.find(
      (c) => c.name === "confidence_score",
    ) as ColumnLike | undefined
    expect(column?.getSQLType()).toBe("real")
  })
})

describe("schema against the live database", () => {
  it("declares no missing and no extra tables", async () => {
    const live = await db.execute<{ table_name: string }>(
      sql.raw(`
        select table_name from information_schema.tables
        where table_schema = 'public' and table_name in (${TABLE_LIST_SQL})
      `),
    )
    const liveNames = new Set(live.map((r) => r.table_name))
    const schemaNames = new Set(allTables().map((t) => configOf(t).name))

    const missing = [...liveNames].filter((n) => !schemaNames.has(n)).sort()
    const extra = [...schemaNames].filter((n) => !liveNames.has(n)).sort()

    expect({ missing, extra }).toEqual({ missing: [], extra: [] })
  })

  it("declares no missing and no extra columns", async () => {
    const live = await liveColumns()
    const configs = tableConfigByName()

    const missing: string[] = []
    const extra: string[] = []

    for (const row of live) {
      const columns = configs.get(row.table_name)?.columns ?? []
      if (!columns.some((c) => c.name === row.column_name)) {
        missing.push(`${row.table_name}.${row.column_name}`)
      }
    }

    const liveKeys = new Set(live.map((r) => `${r.table_name}.${r.column_name}`))
    let schemaColumnCount = 0
    for (const [tableName, config] of configs) {
      for (const column of config.columns) {
        schemaColumnCount += 1
        const key = `${tableName}.${column.name}`
        if (!liveKeys.has(key)) extra.push(key)
      }
    }

    // Guards the vacuous case: an empty schema has no extra columns either.
    expect(schemaColumnCount).toBe(live.length)
    expect({
      missing: missing.sort(),
      extra: extra.sort(),
    }).toEqual({ missing: [], extra: [] })
  })

  it("agrees with the live database on type, nullability and default", async () => {
    const live = await liveColumns()
    const configs = tableConfigByName()
    const mismatches: string[] = []

    for (const row of live) {
      const column = configs.get(row.table_name)?.columns.find(
        (c) => c.name === row.column_name,
      ) as ColumnLike | undefined
      if (!column) {
        mismatches.push(`${row.table_name}.${row.column_name}: absent from the Drizzle schema`)
        continue
      }
      const key = `${row.table_name}.${row.column_name}`

      const liveType = row.data_type
      if (column.getSQLType() !== liveType) {
        mismatches.push(`${key}: type ${column.getSQLType()} != ${liveType}`)
      }

      const liveNotNull = row.is_nullable === "NO"
      if (column.notNull !== liveNotNull) {
        mismatches.push(`${key}: notNull ${column.notNull} != ${liveNotNull}`)
      }

      const liveDefault = row.column_default === null ? null : normalizeDefault(row.column_default)
      const schemaDefaultRaw = defaultExpression(column)
      const schemaDefault = schemaDefaultRaw === null ? null : normalizeDefault(schemaDefaultRaw)
      if (schemaDefault !== liveDefault) {
        mismatches.push(`${key}: default ${schemaDefault} != ${liveDefault}`)
      }
    }

    expect(mismatches).toEqual([])
  })
})
