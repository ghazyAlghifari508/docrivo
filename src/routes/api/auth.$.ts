import { createFileRoute } from "@tanstack/react-router"

/**
 * `ALL /api/auth/*` -- the Better Auth endpoint.
 *
 * **This route is what makes sign-in possible at all.** `authClient.signIn.social`
 * on the login page posts to `/api/auth/sign-in/social`, and the Google callback
 * lands on `/api/auth/callback/google`. With no route registered here both 404,
 * which is a failure no type-check, unit test, lint rule or `HTTP 200` on `/`
 * will catch -- the homepage does not touch auth. The app looks healthy and
 * nobody can sign in.
 *
 * A splat (`$`) rather than an enumerated list of endpoints: Better Auth owns
 * that surface, and enumerating it here would mean this file needs editing every
 * time the library adds a route. `toNodeHandler` is deliberately not used --
 * `auth.handler` is already a `Request` -> `Response` function, which is the
 * shape a TanStack route handler wants, and wrapping it in Node's http types
 * would only add a conversion.
 *
 * `~/auth/server` is imported **inside** the handlers, never at module scope.
 * A route file is in the client graph, so a top-level import of the Better Auth
 * instance pulls `betterAuth({...})`, the `postgres` driver and all fifteen
 * `pgTable` definitions into `dist/client`, where two of them throw on
 * evaluation and hydration dies on every route. The handlers only ever run on
 * the server, so the dynamic import costs one resolution and keeps the link out
 * of the bundle. Same reasoning as `src/queries/app-db.ts`.
 */
export const Route = createFileRoute("/api/auth/$")({
  server: {
    handlers: {
      GET: async ({ request }) =>
        (await import("~/auth/server")).auth.handler(request),
      POST: async ({ request }) =>
        (await import("~/auth/server")).auth.handler(request),
    },
  },
})
