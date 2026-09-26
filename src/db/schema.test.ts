import { describe, expect, it } from "vitest"
import { getTableName, isTable, SQL, sql } from "drizzle-orm"
import { getTableConfig, IndexedColumn, type PgTable } from "drizzle-orm/pg-core"
import { schema, sql as appSql, testDb, testSql } from "./index"

/** Both database names are project constants; nothing derives them at runtime. */
const EXPECTED_TEST_DATABASE = "docrivo_test"
const EXPECTED_APP_DATABASE = "docrivo"

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
  primary?: boolean
}

type LiveColumn = {
  table_name: string
  column_name: string
  data_type: string
  is_nullable: "YES" | "NO"
  column_default: string | null
}

type LiveForeignKey = {
  conname: string
  table_name: string
  confdeltype: string
  columns: string
  foreign_table: string
  foreign_columns: string
}

type LiveIndex = {
  index_name: string
  table_name: string
  indisunique: boolean
  indoption: string
  predicate: string | null
  columns: string
}

type LiveUniqueConstraint = {
  conname: string
  table_name: string
  columns: string
}

type LivePrimaryKey = {
  table_name: string
  columns: string
}

const configOf = (table: PgTable) => getTableConfig(table)

const allTables = (): PgTable[] =>
  Object.values(schema as Record<string, unknown>).filter(isTable) as PgTable[]

const tableConfigByName = () =>
  new Map(allTables().map((t) => [configOf(t).name, configOf(t)]))

/** Every table's config as an array, for flat-mapping indexes and constraints. */
const allConfigs = () => [...tableConfigByName().values()]

/**
 * Every inspection runs through the test client. Refusing to fall back keeps a
 * suite without `DATABASE_URL_TEST` from silently reading the dev database,
 * which is structurally identical and would pass.
 */
const client = () => {
  if (!testDb) {
    throw new Error(
      "DATABASE_URL_TEST is not set: refusing to inspect the development database",
    )
  }
  return testDb
}

const liveColumns = async () =>
  client().execute<LiveColumn>(sql.raw(`
    select table_name, column_name, data_type, is_nullable, column_default
    from information_schema.columns
    where table_schema = 'public' and table_name in (${TABLE_LIST_SQL})
  `))

/** `pg_constraint.conkey`/`confkey` are attnum arrays; render them as names. */
const ATTNUM_LIST = (column: "conkey" | "confkey", relid: "conrelid" | "confrelid") => `
  (select string_agg(a.attname::text, ',' order by k.ord)
     from unnest(co.${column}) with ordinality as k(attnum, ord)
     join pg_attribute a
       on a.attrelid = co.${relid} and a.attnum = k.attnum)`

const liveForeignKeys = async () =>
  client().execute<LiveForeignKey>(sql.raw(`
    select co.conname, c.relname as table_name, co.confdeltype,
           ${ATTNUM_LIST("conkey", "conrelid")} as columns,
           fc.relname as foreign_table,
           ${ATTNUM_LIST("confkey", "confrelid")} as foreign_columns
    from pg_constraint co
    join pg_class c on c.oid = co.conrelid
    join pg_class fc on fc.oid = co.confrelid
    join pg_namespace n on n.oid = c.relnamespace
    where co.contype = 'f' and n.nspname = 'public' and c.relname in (${TABLE_LIST_SQL})
    order by co.conname
  `))

const liveUniqueConstraints = async () =>
  client().execute<LiveUniqueConstraint>(sql.raw(`
    select co.conname, c.relname as table_name, ${ATTNUM_LIST("conkey", "conrelid")} as columns
    from pg_constraint co
    join pg_class c on c.oid = co.conrelid
    join pg_namespace n on n.oid = c.relnamespace
    where co.contype = 'u' and n.nspname = 'public' and c.relname in (${TABLE_LIST_SQL})
    order by co.conname
  `))

/**
 * Primary-key and unique-constraint indexes are excluded: they belong to
 * `pg_constraint`, not to a declared `index()`. A `uniqueIndex()` has no
 * constraint behind it and stays in, which is how the partial unique index is
 * reached.
 */
const liveDeclaredIndexes = async () =>
  client().execute<LiveIndex>(sql.raw(`
    select ic.relname as index_name, c.relname as table_name, i.indisunique,
           i.indoption::text as indoption,
           pg_get_expr(i.indpred, i.indrelid) as predicate,
           (select string_agg(a.attname::text, ',' order by k.ord)
              from unnest(i.indkey::smallint[]) with ordinality as k(attnum, ord)
              join pg_attribute a
                on a.attrelid = i.indrelid and a.attnum = k.attnum) as columns
    from pg_index i
    join pg_class ic on ic.oid = i.indexrelid
    join pg_class c on c.oid = i.indrelid
    join pg_namespace n on n.oid = c.relnamespace
    where n.nspname = 'public' and c.relname in (${TABLE_LIST_SQL})
      and not i.indisprimary
      and not exists (select 1 from pg_constraint q where q.conindid = i.indexrelid)
    order by ic.relname
  `))

const liveIndexNamesFromPgIndexes = async () =>
  client().execute<{ indexname: string }>(sql.raw(`
    select indexname from pg_indexes
    where schemaname = 'public' and tablename in (${TABLE_LIST_SQL})
  `))

const livePrimaryKeys = async () =>
  client().execute<LivePrimaryKey>(sql.raw(`
    select c.relname as table_name, ${ATTNUM_LIST("conkey", "conrelid")} as columns
    from pg_constraint co
    join pg_class c on c.oid = co.conrelid
    join pg_namespace n on n.oid = c.relnamespace
    where co.contype = 'p' and n.nspname = 'public' and c.relname in (${TABLE_LIST_SQL})
    order by c.relname
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

/** Value only: every `::cast` is dropped, because this compares meanings. */
const normalizeDefault = (raw: string): string =>
  raw
    .replace(/::[a-z_ ]+/gi, "")
    .trim()
    .replace(/^'([\s\S]*)'$/, "$1")
    .replace(/^\(([\s\S]*)\)$/, "$1")
    .trim()

/**
 * PostgreSQL annotates every string-literal default on a `text` column with
 * `::text` by itself. No TypeScript default can spell that, and it carries no
 * information, so it is the one cast allowed to differ. Every other cast is
 * part of the declared default and has to be written out — which is what
 * separates `sql`'{}'::jsonb`` from `sql`'{}'``.
 */
const BARE_LITERAL_TEXT = /^'[\s\S]*'::text$/

const CAST = /::\s*[a-z_][a-z0-9_ ]*/gi

const allCasts = (raw: string): string[] =>
  (raw.match(CAST) ?? []).map((c) => c.replace(/\s+/g, " ").toLowerCase().trim())

const requiredLiveCasts = (raw: string): string[] =>
  BARE_LITERAL_TEXT.test(raw.trim()) ? [] : allCasts(raw)

/** Drizzle's `pg_constraint.confdeltype` codes, as `.onDelete()` spells them. */
const DELETE_ACTION: Record<string, string> = {
  a: "no action",
  r: "restrict",
  c: "cascade",
  n: "set null",
  d: "set default",
}

type SchemaIndex = ReturnType<typeof configOf>["indexes"][number]

const schemaIndexes = (): SchemaIndex[] =>
  allConfigs().flatMap((config) => config.indexes)

/**
 * `indoption` packs two bits per column: 1 = descending, 2 = nulls first. Bit
 * 2 is the one that matters for results — a `DESC` index that silently became
 * NULLS LAST returns a different row order.
 */
const decodeIndoption = (raw: string) =>
  raw
    .trim()
    .split(/\s+/)
    .filter(Boolean)
    .map((token) => {
      const bits = Number(token)
      return { desc: (bits & 1) !== 0, nullsFirst: (bits & 2) !== 0 }
    })

/**
 * Reads the ordering Drizzle will emit for an index column. `indexConfig` is a
 * clone taken by `.on()`, so this reports what the index declares rather than
 * mutating the shared column.
 */
const declaredOrder = (index: SchemaIndex) =>
  index.config.columns
    .filter((column): column is IndexedColumn => column instanceof IndexedColumn)
    .map((column) => ({
      name: column.name,
      desc: column.indexConfig.order === "desc",
      nullsFirst: column.indexConfig.nulls === "first",
    }))

/**
 * Renders a partial index's `where` clause the way Drizzle would emit it.
 * `dialect` is marked internal but is the only renderer that substitutes
 * parameters and quotes identifiers correctly; `chunkText` cannot.
 */
type SqlRenderer = { sqlToQuery(chunk: SQL): { sql: string; params: unknown[] } }

const renderWhere = (index: SchemaIndex): string | null => {
  if (!index.config.where) return null
  const { dialect } = client() as unknown as { dialect: SqlRenderer }
  return dialect.sqlToQuery(index.config.where).sql
}

describe("local database", () => {
  it(`inspects ${EXPECTED_TEST_DATABASE}, never the development database`, async () => {
    const rows = await client().execute<{ current_database: string }>(
      sql`select current_database() as current_database`,
    )
    expect(rows[0]?.current_database).toBe(EXPECTED_TEST_DATABASE)
  })

  it("builds the application client from DATABASE_URL, never DATABASE_URL_TEST", () => {
    const appDatabase = (appSql as unknown as { options: { database: string } }).options.database
    const testDatabase = (testSql as unknown as { options: { database: string } } | null)?.options
      .database

    expect(testDatabase).toBe(EXPECTED_TEST_DATABASE)
    expect(appDatabase).toBe(EXPECTED_APP_DATABASE)
    expect(appDatabase).not.toBe(testDatabase)
  })

  it("has every application table", async () => {
    const rows = await client().execute<{ table_name: string }>(
      sql`select table_name from information_schema.tables
          where table_schema = 'public' and table_type = 'BASE TABLE'`,
    )
    const found = rows.map((r) => r.table_name)
    for (const t of EXPECTED_TABLES) expect(found).toContain(t)
  })

  it("resolves generation_jobs.user_id as a uuid column", async () => {
    const rows = await client().execute<{ data_type: string }>(
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
    const live = await client().execute<{ table_name: string }>(
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

  it("agrees with the live database on every default's explicit cast", async () => {
    const live = await liveColumns()
    const configs = tableConfigByName()
    const mismatches: string[] = []
    let compared = 0

    for (const row of live) {
      if (row.column_default === null) continue
      const column = configs.get(row.table_name)?.columns.find(
        (c) => c.name === row.column_name,
      ) as ColumnLike | undefined
      if (!column) continue

      const schemaRaw = defaultExpression(column)
      if (schemaRaw === null) {
        mismatches.push(`${row.table_name}.${row.column_name}: no schema default to carry the cast`)
        continue
      }

      compared += 1
      const liveCasts = requiredLiveCasts(row.column_default)
      const declaredCasts = allCasts(schemaRaw)
      if (declaredCasts.join(",") !== liveCasts.join(",")) {
        mismatches.push(
          `${row.table_name}.${row.column_name}: declared [${declaredCasts.join(", ")}] != live [${liveCasts.join(", ")}]`,
        )
      }
    }

    // Non-vacuity: the loop skips columns with no live default, so an empty
    // comparison would otherwise read as agreement.
    expect(compared).toBe(live.filter((r) => r.column_default !== null).length)
    expect(mismatches).toEqual([])
  })
})

describe("foreign keys", () => {
  it("names every foreign key exactly as the database does", async () => {
    const live = await liveForeignKeys()
    const declared = allConfigs().flatMap((c) => c.foreignKeys.map((f) => f.getName()))

    const liveNames = live.map((r) => r.conname).sort()
    const schemaNames = [...declared].sort()

    const missing = liveNames.filter((n) => !schemaNames.includes(n))
    const extra = schemaNames.filter((n) => !liveNames.includes(n))

    expect({ missing, extra }).toEqual({ missing: [], extra: [] })
  })

  it("agrees with the database on every foreign key's columns and delete action", async () => {
    const live = await liveForeignKeys()
    const declared = new Map(
      allConfigs().flatMap((c) => c.foreignKeys.map((f) => [f.getName(), f] as const)),
    )
    const mismatches: string[] = []

    // Non-vacuity: the detail checks below skip any key the name test already
    // reported as absent, so the count has to line up for them to have run.
    expect(declared.size).toBe(live.length)

    for (const row of live) {
      const foreignKey = declared.get(row.conname)
      if (!foreignKey) continue

      const reference = foreignKey.reference()

      const local = reference.columns.map((c) => c.name).join(",")
      if (local !== row.columns) {
        mismatches.push(`${row.conname}: columns ${local} != ${row.columns}`)
      }

      const target = getTableName(reference.foreignTable)
      const remote = reference.foreignColumns.map((c) => c.name).join(",")
      if (target !== row.foreign_table || remote !== row.foreign_columns) {
        mismatches.push(
          `${row.conname}: references ${target}(${remote}) != ${row.foreign_table}(${row.foreign_columns})`,
        )
      }

      const action = DELETE_ACTION[row.confdeltype.trim()]
      if (foreignKey.onDelete !== action) {
        mismatches.push(`${row.conname}: onDelete ${foreignKey.onDelete} != ${action}`)
      }
    }

    expect(mismatches).toEqual([])
  })
})

describe("unique constraints", () => {
  it("names the unique constraint on payment_transactions.order_id as the database does", async () => {
    const live = await liveUniqueConstraints()
    const declared = allConfigs().flatMap((c) =>
      c.uniqueConstraints.map((u) => [u.getName(), u] as const),
    )

    const declaredByName = new Map(declared)

    expect(live.map((r) => r.conname).sort()).toEqual([...declaredByName.keys()].sort())
    for (const row of live) {
      const constraint = declaredByName.get(row.conname)
      expect(constraint?.columns.map((c) => c.name).join(",")).toBe(row.columns)
    }
  })
})

describe("indexes", () => {
  it("declares every index the database has, and no index it lacks", async () => {
    const live = await liveDeclaredIndexes()
    const declared = schemaIndexes()
    // A Drizzle index can be unnamed, which would make it unmatchable to the
    // catalog; the placeholder keeps such an index visible as an extra name
    // rather than silently dropping it.
    const declaredNames = declared.map((i) => i.config.name ?? "<unnamed>").sort()
    const liveNames = live.map((r) => r.index_name).sort()

    const missing = liveNames.filter((n) => !declaredNames.includes(n))
    const extra = declaredNames.filter((n) => !liveNames.includes(n))

    expect({ missing, extra }).toEqual({ missing: [], extra: [] })
  })

  it("agrees with pg_indexes on every declared index's uniqueness", async () => {
    const live = await liveDeclaredIndexes()
    const inPgIndexes = new Set(
      (await liveIndexNamesFromPgIndexes()).map((r) => r.indexname),
    )
    const mismatches: string[] = []

    for (const row of live) {
      if (!inPgIndexes.has(row.index_name)) {
        mismatches.push(`${row.index_name}: absent from pg_indexes`)
      }
    }

    const declared = schemaIndexes()
    // Non-vacuity: the loop below skips declared indexes the name test already
    // reported as absent from the database.
    expect(declared.length).toBe(live.length)

    for (const index of declared) {
      const row = live.find((r) => r.index_name === index.config.name)
      if (!row) continue
      if (row.indisunique !== index.config.unique) {
        mismatches.push(`${row.index_name}: unique ${index.config.unique} != ${row.indisunique}`)
      }
    }

    expect(mismatches).toEqual([])
  })

  it("agrees with the database on every index column's order and nulls placement", async () => {
    const live = await liveDeclaredIndexes()
    const declared = schemaIndexes()
    const mismatches: string[] = []

    // Non-vacuity: this loop compares index-by-index, so a schema missing every
    // index would compare nothing.
    expect(declared.length).toBe(live.length)

    for (const row of live) {
      const index = declared.find((i) => i.config.name === row.index_name)
      if (!index) continue

      const ordered = declaredOrder(index)
      const actual = decodeIndoption(row.indoption)

      if (ordered.map((c) => c.name).join(",") !== row.columns) {
        mismatches.push(
          `${row.index_name}: columns ${ordered.map((c) => c.name).join(",")} != ${row.columns}`,
        )
        continue
      }
      if (ordered.length !== actual.length) {
        mismatches.push(
          `${row.index_name}: ${ordered.length} columns, indoption has ${actual.length}`,
        )
        continue
      }

      for (const [position, column] of ordered.entries()) {
        const bit = actual[position]
        if (column.desc !== bit.desc) {
          mismatches.push(
            `${row.index_name}.${column.name}: desc ${column.desc} != ${bit.desc}`,
          )
        }
        if (column.nullsFirst !== bit.nullsFirst) {
          mismatches.push(
            `${row.index_name}.${column.name}: nulls first ${column.nullsFirst} != ${bit.nullsFirst}`,
          )
        }
      }
    }

    expect(mismatches).toEqual([])
  })

  it("keeps the partial unique index partial, with the database's predicate", async () => {
    const live = await liveDeclaredIndexes()
    const declared = schemaIndexes()

    const livePartial = live.filter((r) => r.predicate !== null)
    const declaredPartial = declared.filter((i) => i.config.where !== undefined)

    expect(livePartial.map((r) => r.index_name).sort()).toEqual(
      declaredPartial.map((i) => i.config.name).sort(),
    )
    for (const index of declaredPartial) {
      const row = live.find((r) => r.index_name === index.config.name)
      expect({ index: index.config.name, where: renderWhere(index) }).toEqual({
        index: index.config.name,
        where: row?.predicate,
      })
    }
  })
})

describe("primary keys", () => {
  it("gives every table a primary key, matching the database's columns", async () => {
    const live = await livePrimaryKeys()
    const configs = tableConfigByName()
    const mismatches: string[] = []

    for (const [tableName, config] of configs) {
      const declared = config.columns
        .filter((c) => (c as ColumnLike).primary === true)
        .map((c) => c.name)
      if (declared.length === 0) {
        mismatches.push(`${tableName}: no primary key declared`)
        continue
      }
      const row = live.find((r) => r.table_name === tableName)
      if (!row) {
        mismatches.push(`${tableName}: no primary key in the database`)
        continue
      }
      if (declared.join(",") !== row.columns) {
        mismatches.push(`${tableName}: primary key (${declared.join(",")}) != (${row.columns})`)
      }
    }

    const missing = live
      .map((r) => r.table_name)
      .filter((n) => !configs.has(n))
      .sort()

    expect({ mismatches, missing }).toEqual({ mismatches: [], missing: [] })
  })
})
