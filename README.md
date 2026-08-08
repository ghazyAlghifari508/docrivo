# Docrivo

AI-powered website generator. Paste a URL, Docrivo scrapes the layout and generates a fresh version using AI.

[![Next.js](https://img.shields.io/badge/Next.js-16-black?logo=next.js)](https://nextjs.org/)
[![TypeScript](https://img.shields.io/badge/TypeScript-5-blue?logo=typescript)](https://www.typescriptlang.org/)
[![Tailwind CSS](https://img.shields.io/badge/Tailwind-v4-38bdf8?logo=tailwindcss)](https://tailwindcss.com/)

## How It Works

1. User pastes a target URL
2. Playwright scrapes the page layout, CSS, and assets
3. NVIDIA NIM generates a new website based on the scraped design
4. User previews the result in-browser
5. Credits are deducted per generation

## Tech Stack

- **Framework:** Next.js 16 (App Router)
- **Database & Auth:** [InsForge](https://insforge.dev) — open-source Postgres-based BaaS with database, auth, file storage, edge functions, realtime, and payments
- **AI Provider:** NVIDIA NIM — Mistral Small 4 (119B params)
- **Payments:** Midtrans — Indonesian payment gateway (sandbox mode)
- **Scraping:** Playwright headless browser
- **Styling:** Tailwind CSS v4
- **Validation:** Zod v4
- **Testing:** Vitest
- **Package Manager:** npm
- **Language:** TypeScript

## Quick Start

```bash
git clone https://github.com/ghazyAlghifari508/docrivo.git
cd docrivo
npm install
```

## Getting Started

### Prerequisites

- Node.js 20+
- npm or yarn
- An [InsForge](https://insforge.dev) project (free tier available)
- NVIDIA NIM API key ([get one here](https://build.nvidia.com/))
- Midtrans sandbox account (optional, for payment testing)

### Installation

```bash
npm install
cp .env.example .env.local   # fill in your keys
npm run dev
```

Open [http://localhost:3000](http://localhost:3000) in your browser.

### InsForge Setup

1. Create a project at [insforge.dev](https://insforge.dev)
2. Copy the API base URL and server key to `.env.local`
3. Run InsForge migrations to create the database schema:
   ```bash
   npx insforge db push
   ```
4. Set up RLS policies for the `generations`, `credits`, and `payments` tables

### Running the Worker

The background worker handles async generation jobs:

```bash
npm run worker
```

The worker polls InsForge for pending jobs every `WORKER_POLL_MS` milliseconds.

## Environment Variables

| Variable | Description |
|----------|-------------|
| `INSFORGE_URL` | InsForge project API base |
| `INSFORGE_API_KEY` | InsForge server-side key |
| `NVIDIA_API_KEY` | NVIDIA NIM API key |
| `AI_MODEL` | AI model ID |
| `MIDTRANS_SERVER_KEY` | Midtrans server key |
| `MIDTRANS_CLIENT_KEY` | Midtrans client key |
| `ADMIN_TOKEN` | Admin page guard token |
| `WORKER_POLL_MS` | Background worker poll interval in ms (default: 2000) |
| `MAX_PAGES` | Max pages to scrape per URL (default: 5) |

## Scripts

| Command | Description |
|---------|-------------|
| `npm run dev` | Start dev server (custom script with hot reload) |
| `npm run build` | Production build |
| `npm run start` | Start production server |
| `npm run lint` | Run ESLint |
| `npm run test` | Run Vitest test suite |
| `npm run worker` | Start background worker (tsx watch mode) |

## Project Structure

```
src/
├── app/                # Next.js App Router pages
│   ├── about/          # About page
│   ├── admin/          # Admin dashboard
│   ├── api/            # API route handlers
│   ├── bantuan/        # Help/support page (ID)
│   ├── faq/            # FAQ page
│   ├── generations/    # AI generation results
│   ├── history/        # User generation history
│   ├── login/          # Authentication page
│   ├── maintenance/    # Maintenance mode page
│   ├── pricing/        # Pricing & plans
│   ├── profile/        # User profile
│   ├── setting/        # User settings
│   ├── template/       # Template browser
│   └── tentang/        # About page (ID)
├── components/         # React components
│   ├── generation-form.tsx    # URL input & generation trigger
│   ├── generation-result.tsx  # Generated output display
│   ├── home-generator.tsx     # Homepage generator widget
│   ├── pricing-cards.tsx      # Plan comparison cards
│   ├── payment-verifier.tsx   # Payment status checker
│   ├── history-list.tsx       # History browser
│   ├── site-header.tsx        # Navigation header
│   ├── site-footer.tsx        # Site footer
│   └── topographic.tsx        # Decorative background
├── lib/                # Core utilities
│   ├── ai-provider.ts      # NVIDIA NIM integration
│   ├── insforge.ts         # InsForge SDK client
│   ├── insforge-core.ts    # Core InsForge operations
│   ├── insforge-server.ts  # Server-side InsForge helpers
│   ├── midtrans.ts         # Payment gateway integration
│   ├── render-page.ts      # Page rendering logic
│   ├── fetch-html.ts       # HTML scraping utilities
│   ├── rate-limit.ts       # API rate limiting
│   ├── retry.ts            # Retry with exponential backoff
│   ├── url-validator.ts    # URL safety validation
│   └── types.ts            # Shared TypeScript types
├── proxy.ts            # Proxy utilities
worker/
└── index.ts            # Background worker for async jobs
```

## Features

### Core
- **URL Scraping** — Playwright headless browser captures layout, CSS, animations, and lazy-loaded assets
- **AI Generation** — NVIDIA NIM rewrites the scraped design into fresh code
- **Live Preview** — sandboxed iframe preview with CSP isolation
- **Templates** — save and reuse generated designs

### User System
- **Authentication** — email/password via InsForge Auth
- **Credit System** — pay-per-generation model with plan-based allocation
- **Generation History** — browse past generations with search
- **User Profile** — manage account and view usage stats

### Payments
- **Midtrans Integration** — Indonesian payment gateway (bank transfer, e-wallet, QRIS)
- **Plan-based Pricing** — free tier + paid plans with different credit allocations
- **Payment Verification** — server-side webhook verification

### Admin
- **Dashboard** — monitor generations, users, and revenue
- **User Management** — view and manage user accounts
- **System Health** — worker status and queue monitoring

## Security

- Content Security Policy (CSP) headers configured in `next.config.ts`
- Server-only API keys — never exposed as `NEXT_PUBLIC_*` environment variables
- Admin page guarded by `ADMIN_TOKEN` header check
- Rate limiting on API routes via in-memory token bucket
- URL validation on scrape endpoints to prevent SSRF
- Sandboxed iframe for generation preview (`sandbox allow-scripts`)
- X-Content-Type-Options, X-Frame-Options, Referrer-Policy headers set globally

## API Routes

| Endpoint | Method | Auth | Description |
|----------|--------|------|-------------|
| `/api/scrape` | POST | Yes | Scrape a URL and extract layout/assets |
| `/api/scrape/preview` | GET | No | Sandboxed preview of scraped content |
| `/api/generate` | POST | Yes | Generate a new website from scraped data |
| `/api/history` | GET | Yes | Fetch user's generation history |
| `/api/payment` | POST | Yes | Initiate Midtrans payment |
| `/api/payment/webhook` | POST | No | Midtrans payment callback (verified by signature) |
| `/api/admin/*` | Various | Admin | Admin-only endpoints (token required) |

## Database Schema

Docrivo uses InsForge's managed Postgres. Key tables:

| Table | Description |
|-------|-------------|
| `users` | User accounts (managed by InsForge Auth) |
| `generations` | AI-generated website records |
| `plans` | Pricing plan definitions |
| `credits` | User credit balances |
| `payments` | Midtrans payment records |
| `templates` | Saved template definitions |

Row-level security (RLS) policies ensure users can only access their own data. All database operations go through the InsForge SDK (`@insforge/sdk`), which enforces these policies automatically.

## Internationalization

Docrivo supports Indonesian (ID) and English. Duplicate page routes exist for localized content:

| English | Indonesian | Description |
|---------|-----------|-------------|
| `/about` | `/tentang` | About page |
| `/faq` | `/bantuan` | Help/FAQ page |

## License

Private project. All rights reserved.
