import { config } from "dotenv"
import { drizzle } from "drizzle-orm/postgres-js"
import postgres from "postgres"
import * as schema from "./schema"
import * as authSchema from "./schema-auth"

config({ path: [".env.local", ".env"], quiet: true })

// The application client reads DATABASE_URL. It must never fall back to
// DATABASE_URL_TEST -- .env.local defines both, so a test-first resolution
// points the running application at docrivo_test.
const url = process.env.DATABASE_URL
if (!url) throw new Error("DATABASE_URL is required")

// Better Auth's four tables join the application's so the adapter can resolve
// them by name. `schema` stays exported as the application tables alone:
// `schema.test.ts` asserts that the namespace and the eleven baseline tables
// match exactly, so folding the auth tables in would fail it. The test client
// gets the full set, keeping the two databases interchangeable.
const allTables = { ...schema, ...authSchema }

export { schema, authSchema }

// Named `pgClient`, not `sql`. drizzle-orm exports a template tag called `sql`,
// and exporting the postgres-js client under that name shadows it in any module
// that imports both -- `db.execute(sql\`...\`)` then resolves to the client and
// throws `query.getSQL is not a function`. Anything needing both must alias the
// drizzle-orm tag at the import site instead.
export const pgClient = postgres(url, { max: 5 })
export const db = drizzle(pgClient, { schema: allTables })

// A separate client for the test suite, so tests target docrivo_test without
// the application ever resolving to it by accident. Null when unset, so a test
// that needs it fails loudly rather than silently using the dev database.
const testUrl = process.env.DATABASE_URL_TEST
export const testPgClient = testUrl ? postgres(testUrl, { max: 5 }) : null
export const testDb = testPgClient ? drizzle(testPgClient, { schema: allTables }) : null
