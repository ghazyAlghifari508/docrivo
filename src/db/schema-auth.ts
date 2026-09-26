/**
 * Better Auth's four tables: `users`, `session`, `account`, `verification`.
 *
 * Provenance: emitted by `generateDrizzleSchema` from
 * `@better-auth/drizzle-adapter@1.7.6` — the function `npx auth generate
 * --adapter drizzle` calls. The CLI ships as `@better-auth/cli` and is versioned
 * separately from `better-auth`: it tops out at 1.4.21, so running it against
 * `better-auth@1.7.6` would have generated a 1.4 schema. Calling the generator
 * inside the installed, pinned 1.7.6 keeps this file matching the version that
 * actually serves requests. Regenerate with `drizzle-kit generate` pointed at
 * this file alone, and `betterAuth({ user: { modelName: "users" }, advanced:
 * { database: { generateId: "uuid" } } })` as the options.
 *
 * Two deliberate edits to the generator's output, both narrowing a gap rather
 * than diverging from Better Auth:
 *
 *   * `timestamp(..., { withTimezone: true })`, i.e. `timestamptz`. The
 *     generator emits a bare `timestamp` for dates, but Better Auth's own
 *     PostgreSQL migration compiler uses `timestamptz` (see
 *     `better-auth/dist/db/get-migration.mjs`), and so does every application
 *     table in `schema.ts`. Session expiry and token expiry are read back and
 *     compared as instants; a zone-less column makes that depend on the
 *     server's timezone.
 *   * explicit names on the two unique constraints and the two foreign keys.
 *     Drizzle would otherwise synthesise `_unique` and `_fk` suffixes, and
 *     this database uses PostgreSQL's `_key` / `_fkey` defaults everywhere.
 *
 * Column names are snake_case while the object keys are camelCase, which is
 * what the generator emits for PostgreSQL and what `schema.ts` does too.
 */
import { sql } from "drizzle-orm"
import { boolean, foreignKey, index, pgTable, text, timestamp, unique, uuid } from "drizzle-orm/pg-core"

const createdAt = () => timestamp("created_at", { withTimezone: true }).defaultNow().notNull()

const updatedAt = () =>
  timestamp("updated_at", { withTimezone: true })
    .defaultNow()
    .$onUpdate(() => new Date())
    .notNull()

export const users = pgTable(
  "users",
  {
    /** UUID, not the `text` Better Auth defaults to: eight application tables hold `user_id uuid`. */
    id: uuid("id")
      .default(sql`pg_catalog.gen_random_uuid()`)
      .primaryKey(),
    name: text("name").notNull(),
    email: text("email").notNull(),
    emailVerified: boolean("email_verified")
      .default(false)
      .notNull(),
    image: text("image"),
    createdAt: createdAt(),
    updatedAt: updatedAt(),
  },
  (t) => [unique("users_email_key").on(t.email)],
)

export const session = pgTable(
  "session",
  {
    id: uuid("id")
      .default(sql`pg_catalog.gen_random_uuid()`)
      .primaryKey(),
    expiresAt: timestamp("expires_at", { withTimezone: true }).notNull(),
    token: text("token").notNull(),
    createdAt: createdAt(),
    updatedAt: updatedAt(),
    ipAddress: text("ip_address"),
    userAgent: text("user_agent"),
    userId: uuid("user_id").notNull(),
  },
  (t) => [
    foreignKey({
      columns: [t.userId],
      foreignColumns: [users.id],
      name: "session_user_id_fkey",
    }).onDelete("cascade"),
    unique("session_token_key").on(t.token),
    index("session_userId_idx").on(t.userId),
  ],
)

export const account = pgTable(
  "account",
  {
    id: uuid("id")
      .default(sql`pg_catalog.gen_random_uuid()`)
      .primaryKey(),
    accountId: text("account_id").notNull(),
    providerId: text("provider_id").notNull(),
    userId: uuid("user_id").notNull(),
    accessToken: text("access_token"),
    refreshToken: text("refresh_token"),
    idToken: text("id_token"),
    accessTokenExpiresAt: timestamp("access_token_expires_at", { withTimezone: true }),
    refreshTokenExpiresAt: timestamp("refresh_token_expires_at", { withTimezone: true }),
    scope: text("scope"),
    /** Unused while `emailAndPassword` is disabled; Better Auth still declares the column. */
    password: text("password"),
    createdAt: createdAt(),
    updatedAt: updatedAt(),
  },
  (t) => [
    foreignKey({
      columns: [t.userId],
      foreignColumns: [users.id],
      name: "account_user_id_fkey",
    }).onDelete("cascade"),
    index("account_userId_idx").on(t.userId),
  ],
)

export const verification = pgTable(
  "verification",
  {
    id: uuid("id")
      .default(sql`pg_catalog.gen_random_uuid()`)
      .primaryKey(),
    identifier: text("identifier").notNull(),
    value: text("value").notNull(),
    expiresAt: timestamp("expires_at", { withTimezone: true }).notNull(),
    createdAt: createdAt(),
    updatedAt: updatedAt(),
  },
  (t) => [index("verification_identifier_idx").on(t.identifier)],
)
