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
 * Three deliberate edits to the generator's output. The first two narrow a gap
 * rather than diverge from Better Auth. The third is forced by a version skew
 * between two dependencies and is not a style choice.
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
 *   * the generator's `authRelations` block is dropped, and its
 *     `defineRelationsPart` import with it. Emitted, it reads
 *     `export const authRelations = defineRelationsPart({ users, session,
 *     account, verification }, (r) => ({ ... users: { sessions: r.many.session
 *     ({...}), accounts: r.many.account({...}) }, session: { users: r.one.users
 *     ({...}) }, account: { users: r.one.users({...}) } }))`.
 *
 * Why the third edit is necessary: the installed `drizzle-orm` is **0.45.3**,
 * and it has no `defineRelationsPart`. The symbol is absent from the whole of
 * `node_modules/drizzle-orm` and is not an export of the package; it arrives in
 * `drizzle-orm` 1.0.0-rc.1, part of the relations-v2 API. 0.45.3 ships only the
 * older v1 `relations()` helper. `better-auth@1.7.6` nevertheless declares the
 * peer range `"drizzle-orm": "^0.45.2 || >=1.0.0-rc.1 <2.0.0"`, which 0.45.3
 * satisfies, so the generator targets the newer API against a runtime that
 * cannot compile it. Nothing in this file needs the relations, so omitting them
 * is the minimal fix; upgrading `drizzle-orm` is the real one.
 *
 * Consequences for whoever touches this next:
 *
 *   * Drizzle's relational *joins* are unavailable. `db.query.session` does
 *     exist and a flat `findMany()` works, but
 *     `db.query.session.findMany({ with: { users: true } })` throws
 *     `TypeError: Cannot read properties of undefined (reading
 *     'referencedTable')`, because no relations are registered. Use
 *     `db.select()` with an explicit join, or define v1 `relations()` for these
 *     four tables.
 *   * Re-running the 1.7.6 generator re-emits
 *     `import { defineRelationsPart, sql } from "drizzle-orm"` and the
 *     `authRelations` block, and the result will not typecheck — drop both
 *     again. `drizzle-kit generate` is unaffected: it reads the declared
 *     tables, not the relations, so the auth DDL still regenerates from this
 *     file.
 *   * Better Auth's own adapter is unaffected either way. It uses
 *     `db.select()` / `db.insert()` and never `db.query`, so sign-in is
 *     unaffected. Do not "restore" the block until `drizzle-orm` is on
 *     1.0.0-rc.1 or later.
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
