import { config } from "dotenv"
import { drizzle } from "drizzle-orm/postgres-js"
import postgres from "postgres"
import * as schema from "./schema"

config({ path: [".env.local", ".env"], quiet: true })

// The application client reads DATABASE_URL. It must never fall back to
// DATABASE_URL_TEST -- .env.local defines both, so a test-first resolution
// points the running application at docrivo_test.
const url = process.env.DATABASE_URL
if (!url) throw new Error("DATABASE_URL is required")

export { schema }
export const sql = postgres(url, { max: 5 })
export const db = drizzle(sql, { schema })

// A separate client for the test suite, so tests target docrivo_test without
// the application ever resolving to it by accident. Null when unset, so a test
// that needs it fails loudly rather than silently using the dev database.
const testUrl = process.env.DATABASE_URL_TEST
export const testSql = testUrl ? postgres(testUrl, { max: 5 }) : null
export const testDb = testUrl ? drizzle(testSql!, { schema }) : null
