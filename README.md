# Docrivo

AI-powered design-system reference generator. Paste a public URL, Docrivo crawls
it with a real browser, extracts the visual system, and has an LLM write a
`DESIGN.md` you can hand to an AI coding assistant.

[![TanStack](https://img.shields.io/badge/TanStack_Start-1.168.58-pink?logo=tanstack)](https://tanstack.com/start)
[![TypeScript](https://img.shields.io/badge/TypeScript-5.9.3-blue?logo=typescript)](https://www.typescriptlang.org/)
[![Tailwind CSS](https://img.shields.io/badge/Tailwind-v4-38bdf8?logo=tailwindcss)](https://tailwindcss.com/)
[![Drizzle](https://img.shields.io/badge/Drizzle_ORM-0.45.3-brightgreen?logo=drizzle)](https://orm.drizzle.team/)

## How it works

1. You paste a public URL.
2. The worker claims the job from PostgreSQL with `FOR UPDATE SKIP LOCKED`, so two
   workers can never take the same one.
3. Playwright renders the page in Chromium, screenshots it, and walks same-host
   links up to `generation_jobs.max_pages`.
4. The browser-side extractor pulls colours, per-role typography (weight and size,
   not just family), CTA styling, spacing, radii, shadows and CSS custom
   properties out of the live DOM.
5. NVIDIA NIM writes a `DESIGN.md` and an implementation prompt from that
   extraction, with a retry across three models and a validator that rejects a
   document missing any required section.
6. A `useQuery` poll in the browser watches the row and stops on a terminal status.

A second feature scrapes raw `index.html` from a public site for preview and
download. That path is Playwright too — there is no second crawler and no
environment-dependent behaviour.

## Tech stack

Versions are pinned exactly where a caret range would cause drift; see spec §2.4
for the reasoning.

| Layer | Choice | Version |
|---|---|---|
| Framework | TanStack Start (RC) | `1.168.58` |
| Router | TanStack Router (exact-pinned by Start) | `1.170.39` |
| Data fetching | TanStack Query | `5.104.0` |
| Auth | Better Auth, Google OAuth only | `1.7.6` |
| ORM | Drizzle ORM + `postgres` (postgres-js) | `0.45.3` / `3.4.9` |
| Runtime | Node.js | `24.20.0` (`>=22.12` required) |
| Database | PostgreSQL | `17.10` |
| Styling | Tailwind CSS v4 via `@tailwindcss/vite` | `4.3.3` |
| Validation | Zod v4 (Standard Schema) | `4.6.5` |
| Crawling | Playwright | `1.63.0` |
| AI provider | NVIDIA NIM (OpenAI-compatible) | `mistralai/mistral-small-4-119b-2603` |
| Payments | Midtrans Snap REST, sandbox by default | — |
| Testing | Vitest | `5.0.2` |
| Language | TypeScript (not 7.x, deliberately) | `5.9.3` |

TypeScript is held at 5.9.3 rather than npm's `latest` (7.0.2, the native Go
compiler). TanStack Router's route and search-param inference is the main reason
this stack was chosen, and swapping the compiler out in the same change would put
that advantage at risk for a build-speed win nobody asked for.

## Two processes, one database

`npm run dev` starts both:

- **The web tier** — Vite, on `:3000`. SSR, server functions, and the pages.
- **The worker** — `tsx watch worker/index.ts`, on `:8080` for its health check.
  It claims jobs, crawls, and calls the model. It serves no pages.

They are separate because a crawl plus an LLM call takes minutes and must not
share an event loop or a request-scoped connection pool with the pages people are
loading. The worker opens its own `GET /health` so a host can tell "idle" from
"wedged".

## Prerequisites

- Node.js `>=22.12` (developed against `24.20.0`)
- A local PostgreSQL 17, with `trust` auth in `pg_hba.conf` or a password in the
  URL
- A Google OAuth client (see below)
- An NVIDIA NIM API key — [build.nvidia.com](https://build.nvidia.com/)
- Optionally a Midtrans sandbox account

## Setup

```bash
npm install
cp .env.example .env.local     # then fill it in
```

### 1. The database

`migrations/` is the only applied history. Do not run `drizzle-kit migrate`,
`push`, or `generate` — the baseline was cleaned by hand, and the kit would try to
`CREATE TABLE` what already exists. Apply the files in order with `psql`:

```bash
createdb docrivo
createdb docrivo_test          # the suite refuses to touch docrivo
for f in migrations/0*.sql; do psql -d docrivo -v ON_ERROR_STOP=1 -f "$f"; done
for f in migrations/0*.sql; do psql -d docrivo_test -v ON_ERROR_STOP=1 -f "$f"; done
```

`DATABASE_URL` points at `docrivo`; `DATABASE_URL_TEST` at `docrivo_test`. They
have identical schemas, so a mis-resolved connection is invisible until someone
truncates a table they did not mean to. `src/db/index.ts` never falls back from
one to the other.

### 2. Google OAuth

Create an OAuth 2.0 Web client in the Google Cloud Console, enable the People API,
and add a redirect URI of:

```
http://localhost:3000/api/auth/callback/google
```

Put the client id and secret in `.env.local` as `GOOGLE_CLIENT_ID` and
`GOOGLE_CLIENT_SECRET`, and generate `BETTER_AUTH_SECRET` with
`openssl rand -base64 32`. Set `ADMIN_EMAILS` to a comma-separated list of
addresses allowed to open `/admin`; an address that is not on it gets the same
not-found answer as a signed-out visitor.

### 3. Run

```bash
npm run dev
```

Open [http://localhost:3000](http://localhost:3000). `scripts/dev.js` kills
whatever holds ports 3000 and 8080 first, so a stale process from a previous run
does not turn into a bind error.

## Environment variables

Every variable the code reads, verified against `process.env` rather than assumed.
None of them are exposed to the browser.

| Variable | Used by | Notes |
|---|---|---|
| `DATABASE_URL` | `src/db` | the application connection. Required. |
| `DATABASE_URL_TEST` | tests | `docrivo_test`. Tests refuse to run without it. |
| `BETTER_AUTH_SECRET` | session cookie signing | 32+ random bytes. |
| `GOOGLE_CLIENT_ID` / `GOOGLE_CLIENT_SECRET` | OAuth | the only auth provider. |
| `APP_URL` | OAuth callback, Midtrans redirect | must match the opened origin. |
| `ADMIN_EMAILS` | `/admin` gate | comma-separated; empty admits nobody. |
| `SCREENSHOT_DIR` | worker | defaults to `var/screenshots`. |
| `WORKER_POLL_MS` | worker | queue poll interval, default `2000`. |
| `PORT` | worker, `npm start` | worker's health port defaults to `8080`; the web server to `3000`. |
| `HOST` | `npm start` | defaults to `127.0.0.1`. |
| `NVIDIA_API_KEY` | LLM | NVIDIA NIM. |
| `AI_MODEL` | LLM | tried after the built-in default. |
| `MIDTRANS_SERVER_KEY` | payments | server-only. |
| `MIDTRANS_PRODUCTION` | payments | `true` switches to live endpoints. Default sandbox. |
| `MAX_PAGES` | — | only when seeding a job by hand; the worker reads `generation_jobs.max_pages`. |

## Scripts

| Command | Description |
|---|---|
| `npm run dev` | both processes, after clearing ports 3000 and 8080 |
| `npm run dev:web` | the web tier alone |
| `npm run worker` | the worker alone, in watch mode |
| `npm run build` | production build (`vite build` → `dist/client`, `dist/server`) |
| `npm start` | serve the built output (`scripts/serve.mjs`) |
| `npm test` | Vitest |
| `npm run typecheck` | `tsc --noEmit` |
| `npm run lint` | ESLint across the whole project |

## Project structure

```
src/
├── routes/            15 pages, plus api/ for the four HTTP routes
├── components/        18 component files
├── queries/           server functions and the plain functions behind them
│   ├── jobs.ts        generations, claim, child reads, the create mutation
│   ├── scrapes.ts     scrape artifacts
│   ├── entitlements.ts  quota, consume, refund, payment claim
│   ├── plans.ts       the catalogue, through public.list_plans()
│   ├── profile.ts     the session user's own row
│   └── rate-limit.ts  through public.hit_rate_limit()
├── lib/queries/       TanStack Query option factories
│   ├── job.ts         polls until a terminal status
│   ├── scrape.ts      one read, no poll
│   └── plans.ts       the shared catalogue
├── auth/              Better Auth client + server, middleware, admin gate
├── db/                Drizzle client and schema (application tables + auth tables)
├── storage/           filesystem screenshot storage
├── lib/               pure logic: crawler, HTML fetch, preview rewriter, LLM, errors
├── security-headers.ts  the CSP sets, by path
├── start.ts           request + function middleware
└── router.tsx         route tree entry
worker/
├── index.ts           the poll loop, the crawl, the LLM call
├── db.ts              typed Drizzle writes; 13 tests live in db.test.ts
└── db.test.ts
migrations/           the applied SQL baseline — the only schema history
scripts/              dev.js (two processes), serve.mjs (production adapter)
```

Each module in `src/queries/` is split in two on purpose: a plain function that
takes a Drizzle client, and a thin `createServerFn` wrapper. A server function
resolves its request context from AsyncLocalStorage and throws `No Start context
found` when called outside a request, so logic inlined into one cannot be
unit-tested. The tests drive the plain function against `testDb`; the components
call the wrapper.

## API

The four HTTP routes are the only server endpoints. Everything else is a server
function, which is not a public API.

| Route | Method | Auth | Description |
|---|---|---|---|
| `/api/scrape/preview` | `GET` | rate-limited by address | Rewrites a stored artifact's assets through `/api/scrape/asset` and sandboxes it. The stricter CSP applies here. |
| `/api/scrape/asset` | `GET` | rate-limited by address | SSRF-checked binary proxy for a third-party asset. 15 MB cap, 3 redirect hops, re-validated each hop. |
| `/api/screenshot/*` | `GET` | session + ownership | Serves a captured screenshot from disk after checking the caller owns the job. |
| `/api/generations/:id/download` | `GET` | session + ownership | `?type=design-md` or `?type=prompt-md`. |

## Security

- **Ownership failures are 404, never 403.** A resource owned by another user is
  indistinguishable from one that does not exist, so a 403 would turn the endpoint
  into an enumeration oracle for other users' ids. Enforced by scoping the query
  to `user_id`, not by checking the result afterwards, so a row owned by somebody
  else never enters the result set. Tested both ways: the row exists in the
  cross-user case, and the answer is identical.
- **Two-layer SSRF defence** in the crawler: DNS resolution with IP pinning before
  connect, and a `context.route` filter inside the browser. Rejects loopback,
  link-local and private ranges.
- **Response size caps** — 5 MB HTML, 15 MB assets, with redirect-hop
  re-validation and method allowlisting.
- **CSP on every response**, with a stricter `sandbox` override for
  `/api/scrape/preview` so scraped third-party HTML cannot submit forms or change
  its base URI.
- **The preview is sandboxed** (`allow-scripts`, no `allow-same-origin`) and its
  asset URLs are rewritten through the checked proxy, so a scraped page cannot
  phone home to the visitor's network.
- **Rate limiting** in PostgreSQL, through `public.hit_rate_limit()`. The
  generation limit is keyed by user id so users behind one NAT do not throttle
  each other; the proxy limits are keyed by forwarded address.
- **Server-only secrets.** There is no `NEXT_PUBLIC_*` convention and nothing
  server-side is imported into a client component.
- **`X-Content-Type-Options: nosniff`, `X-Frame-Options: DENY`, `Referrer-Policy`**
  on every response.
- **No row-level security.** Ownership is enforced in the application layer, and
  that layer has tests. The database connection is a single non-superuser role,
  which is the only thing standing between a query bug and a data leak.

## Internationalization

Duplicate routes for Indonesian and English content:

| English | Indonesian | Page |
|---|---|---|
| `/about` | `/tentang` | About |
| `/faq` | `/bantuan` | FAQ |

The interface itself is Indonesian; only these two pages are duplicated.

## Contributing

Private project. Contributions by invitation only.

## License

Private. All rights reserved.
