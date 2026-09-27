<!-- BEGIN:stack -->
## This is NOT the Next.js you know

Next.js is gone. This project runs on **TanStack Start** (Vite, not webpack or
Turbopack), so there is no `next.config.ts`, no `src/app` router, no
`getServerSideProps`, and no `next build`. Before writing code, read the
installed package's own types rather than relying on recollection of any
framework:

- `node_modules/@tanstack/react-start` — `createStart`, `createMiddleware`,
  `createServerFn`, `createCsrfMiddleware`
- `node_modules/@tanstack/react-router` — `createFileRoute`, `createRootRoute`,
  `beforeLoad` vs `loader`
- `node_modules/@tanstack/react-query` — query option factories

Version pins live in `docs/superpowers/specs/2026-09-26-docrivo-stack-migration-design.md`
§2.4. TypeScript is pinned to **5.9.3** and must not be bumped to 7.x.
<!-- END:stack -->

<!-- BEGIN:database -->
## Database

PostgreSQL 17, local, via Drizzle ORM. There is no InsForge, no PostgREST, and
no RLS — the connecting role owns its tables and the application filters by
`user_id` in every query instead.

- `migrations/` is the **only** applied schema history. Never run
  `drizzle-kit migrate`, `push`, or `generate`. To change the schema, write a new
  numbered `migrations/*.sql` file and apply it with `psql`, in order.
- The application client is `db` (reads `DATABASE_URL`); the test client is
  `testDb` (reads `DATABASE_URL_TEST`). Tests must use `testDb` so they never
  touch the development database.
- postgres-js clients are exported as `pgClient` / `testPgClient`. **Not** `sql`:
  drizzle-orm also exports a template tag called `sql`, and shadowing it makes
  `db.execute(sql\`...\`)` throw `query.getSQL is not a function`.

### The client/server boundary is load-bearing

`dist/client` must not contain the database client, the Better Auth server, or a
credential. `src/client-bundle.test.ts` enforces this by reading the built
output, because no other gate can see it: `tsc`, `vitest`, `eslint`,
`vite build` and an `HTTP 200` on `/` were all green over a bundle that threw on
every page.

Two rules follow, and both were learned by breaking them:

1. **A top-level `~/db` or `~/auth/server` import in a module that a route or
   component reaches is a leak.** `src/auth/middleware.ts` cannot have one even
   though it looks server-only, because `src/start.ts` is in the client graph
   (function middleware runs on the client too, which is what makes an in-app
   navigation hit the same auth guard a full page load does).
2. **A dynamic `import()` is not a fix on its own.** A bundler treats it as a
   *loading* boundary and ships the module as a lazy chunk. It works only when
   the reference sits inside something the Start plugin strips from the client
   build — a `createServerFn` handler body, or a `createMiddleware().server()`
   body. `src/queries/app-db.ts` and `defaultResolver` in `src/auth/middleware.ts`
   are the two places this is done, and both say so in a comment.
<!-- END:database -->

<!-- BEGIN:auth -->
## Auth

Better Auth, **Google only**. One provider, one sign-in button, no password
field — the imported production accounts have no usable password hash and
`emailAndPassword` is disabled, so re-authentication is by Google.

- `src/auth/server.ts` — the instance. Server-only; import it lazily.
- `src/auth/session-fn.ts` — `getSession`, the server function the root route's
  `beforeLoad` calls. This is the only session resolution a page should do.
- `src/auth/guard.ts` — `requireSession`, `requireAdminSession`,
  `redirectSignedIn`. Call these from `beforeLoad`, never from a loader.
- `src/auth/admin.ts` — `requireAdmin` raises `notFound()`, never 403.
- `src/routes/api/auth/$.ts` — the `/api/auth/*` handler. Removing it makes
  sign-in 404 while the homepage keeps returning 200.

`ADMIN_EMAILS` in `.env.local` is the admin allowlist and fails closed when
empty.

**Ownership failures are 404, never 403.** A resource owned by another user must
be indistinguishable from one that does not exist; a 403 confirms the id is real
and turns the endpoint into an enumeration oracle. `notFound()` returns
`{ isNotFound: true }` and has **no** `status` field — assert on `isNotFound`.

Note that `createStart` displaces Start's default CSRF middleware when you export
a `startInstance`, so `src/start.ts` re-registers it by hand. Keep the
`handlerType === "serverFn"` filter, or page navigations start failing.
<!-- END:auth -->

<!-- BEGIN:conventions -->
## Conventions this project has already paid for

- **Test the return value, not the absence of a throw.** A guard that "rejects"
  by crashing satisfies `toThrow()` while being broken. This mistake shipped
  twice in this codebase.
- **Prove each test can fail.** Write it, break the implementation, confirm the
  named test goes red, revert, confirm green. A test never seen failing is not
  known to work. An assertion that has not been seen failing is a liability.
- **Server functions cannot be unit-tested by direct call** — they resolve their
  context from AsyncLocalStorage and throw `No Start context found`. Keep the
  logic in a plain exported function, have the server function delegate to it,
  and test the plain one. `readOwnedJob` / `getOwnedJob` is the pattern.
- **Inject the clock** for anything time-dependent. Lease expiry and retention
  are boundaries; a test that sleeps cannot prove a boundary.
- `safeNext` returns `null` for both a missing and a rejected `next`. A caller
  that falls back to a default discards the guard, so branch on `null`
  explicitly.
- Global response headers are **defaults**: a header the response already sets
  wins. `/api/scrape/asset` sets `sandbox; default-src 'none'` on purpose, and
  the global CSP would otherwise overwrite it and serve attacker HTML with
  `script-src 'unsafe-inline'` at this origin.
- Never print or commit `.env.local`. `backup/` holds plaintext production data
  and is gitignored; it was deleted in Task 8.1 and must stay deleted.
<!-- END:conventions -->

## Commands

```
npm run dev          # vite dev + tsx watch worker/index.ts
npm run build        # vite build -> dist/client + dist/server
npm start            # node scripts/serve.mjs
npm test             # vitest run
npm run typecheck    # tsc --noEmit
npm run lint         # eslint src worker scripts vite.config.ts
npm run worker       # tsx watch worker/index.ts
npm run reconcile:import   # data-import row-count and FK checks
```

`npm start` needs `scripts/serve.mjs` rather than running the build output
directly: `vite build` emits `dist/server/server.js` as a **fetch handler** that
starts no listener, so running it directly exits 0 having served nothing.

## Known open items

- **Homepage SSR is slow** — `/` takes roughly 12 s warm and longer cold. Its
  loader awaits three server-function RPCs. Profile the loader; the session
  lookup is already cached once per request, so the cost is elsewhere.
- `src/db/schema.ts` and `src/db/schema-auth.ts` still reach `dist/client`. They
  are inert `pgTable` definitions with no connection and no secret, so it is
  bundle weight and schema disclosure rather than a break. Worth closing by the
  same lazy-import route as `src/queries/app-db.ts`.
- `src/queries/jobs.ts`'s `claimNextJob` and `src/queries/rate-limit.ts`'s
  `hitRateLimit` are unauthenticated server functions. The worker needs the
  first; a shared secret or an internal-only guard is the fix for both.
- The Google sign-in round trip has never been exercised in a browser.
