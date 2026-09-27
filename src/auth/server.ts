import { betterAuth } from "better-auth"
import { drizzleAdapter } from "better-auth/adapters/drizzle"
import { db } from "~/db"
import * as authSchema from "~/db/schema-auth"

const appUrl = process.env.APP_URL ?? "http://localhost:3000"

export const auth = betterAuth({
  appName: "Docrivo",
  secret: process.env.BETTER_AUTH_SECRET,
  baseURL: appUrl,

  database: drizzleAdapter(db, {
    provider: "pg",
    schema: authSchema,
  }),

  // Google is the only provider. Email and password are disabled outright, so
  // `account.password` stays null for every row.
  emailAndPassword: { enabled: false },
  socialProviders: {
    google: {
      clientId: process.env.GOOGLE_CLIENT_ID!,
      clientSecret: process.env.GOOGLE_CLIENT_SECRET!,
      redirectURI: `${appUrl}/api/auth/callback/google`,
    },
  },

  user: {
    // `user` is a reserved word in PostgreSQL; `users` spares every reference
    // the quoting it would otherwise need. This is also the name the eight
    // application tables and nine RPC signatures already point at.
    modelName: "users",
  },

  advanced: {
    database: {
      // The literal "uuid", not a `() => crypto.randomUUID()` callback.
      // Better Auth 1.7.6 types this as `GenerateIdFn | false | "serial" |
      // "uuid"`, but only the "uuid" literal reaches the Drizzle schema
      // generator, which is what emits `uuid("id")` and lets PostgreSQL use
      // `gen_random_uuid()`. A custom function is accepted at the type level
      // and then quietly leaves the id column `text`, which no `user_id uuid`
      // column can reference.
      generateId: "uuid",
    },
  },
})

export type Auth = typeof auth
