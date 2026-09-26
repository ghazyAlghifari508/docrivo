import { config } from "dotenv"
import { drizzle } from "drizzle-orm/postgres-js"
import postgres from "postgres"
import * as schema from "./schema"

config({ path: [".env.local", ".env"], quiet: true })

const url = process.env.DATABASE_URL_TEST ?? process.env.DATABASE_URL
if (!url) throw new Error("DATABASE_URL or DATABASE_URL_TEST is required")

export { schema }
export const sql = postgres(url, { max: 5 })
export const db = drizzle(sql, { schema })
