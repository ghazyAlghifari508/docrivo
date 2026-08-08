# Docrivo

AI-powered website generator. Paste a URL, Docrivo scrapes the layout and generates a fresh version using AI.

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
- **Validation:** Zod

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

Open [http://localhost:3000](http://localhost:3000).

## Environment Variables

| Variable | Description |
|----------|-------------|
| `INSFORGE_URL` | InsForge project API base |
| `INSFORGE_API_KEY` | InsForge server-side key |
| `NVIDIA_API_KEY` | NVIDIA NIM API key |
| `AI_MODEL` | AI model ID |
| `MIDTRANS_SERVER_KEY` | Midtrans server key |
| `MIDTRANS_CLIENT_KEY` | Midtrans client key |
| `ADMIN_TOKEN` | Admin page guard |
| `WORKER_POLL_MS` | Worker poll interval (ms) |
| `MAX_PAGES` | Max scrape pages |

## Scripts

```bash
npm run dev       # dev server (custom script)
npm run build     # production build
npm run start     # start production server
npm run lint      # ESLint
npm run test      # Vitest
npm run worker    # background worker (tsx watch)
```

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
- **Credit System** — pay-per-generation model
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

| Endpoint | Method | Description |
|----------|--------|-------------|
| `/api/scrape` | POST | Scrape a URL and extract layout/assets |
| `/api/scrape/preview` | GET | Sandboxed preview of scraped content |
| `/api/generate` | POST | Generate a new website from scraped data |
| `/api/history` | GET | Fetch user's generation history |
| `/api/payment` | POST | Initiate Midtrans payment |
| `/api/payment/webhook` | POST | Midtrans payment callback |
| `/api/admin/*` | Various | Admin-only endpoints |

## License

Private project. All rights reserved.
