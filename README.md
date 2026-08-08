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
├── app/              # Next.js App Router pages
│   ├── about/        # About page
│   ├── admin/        # Admin dashboard
│   ├── api/          # API routes
│   ├── generations/  # AI generation results
│   ├── history/      # User history
│   ├── login/        # Authentication
│   ├── pricing/      # Pricing & plans
│   ├── profile/      # User profile
│   ├── setting/      # User settings
│   └── template/     # Template browser
├── components/       # React components
├── lib/              # Core utilities
│   ├── ai-provider.ts    # NVIDIA NIM integration
│   ├── insforge.ts       # InsForge SDK client
│   ├── midtrans.ts       # Payment gateway
│   ├── render-page.ts    # Page rendering logic
│   └── fetch-html.ts     # HTML scraping
└── proxy.ts          # Proxy utilities
```

## Features

- URL scraping with Playwright headless browser
- AI-powered website generation via NVIDIA NIM
- Real-time generation preview
- User authentication via InsForge
- Credit-based pricing with Midtrans payments
- Generation history and templates
- Admin dashboard
- Responsive design with Tailwind CSS

## Security

- CSP headers configured in `next.config.ts`
- Server-only API keys (never exposed as `NEXT_PUBLIC_*`)
- Admin page guarded by `ADMIN_TOKEN`
- Rate limiting on API routes
- URL validation on scrape endpoints

## License

Private project. All rights reserved.
