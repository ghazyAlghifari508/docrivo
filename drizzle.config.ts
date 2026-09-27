import { config } from "dotenv"
import { defineConfig } from "drizzle-kit"

config({ path: [".env.local", ".env"], quiet: true })

const url = process.env.DATABASE_URL
if (!url) throw new Error("DATABASE_URL is required by drizzle.config.ts")

export default defineConfig({
  dialect: "postgresql",
  // Both files. `src/db/schema.ts` reaches `users` through an import, and
  // drizzle-kit does not follow imports: with only that file listed it emitted
  // the nine `*_user_id_fkey` foreign keys referencing a `public.users` it
  // never created, and skipped `session`, `account` and `verification`
  // entirely. Listing both keeps the generated SQL self-consistent.
  schema: ["./src/db/schema.ts", "./src/db/schema-auth.ts"],
  out: "./drizzle",
  dbCredentials: { url },
})
