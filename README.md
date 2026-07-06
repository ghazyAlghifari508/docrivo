# Docrivo — DesignMD Generator

Docrivo mengubah URL website publik menjadi dokumen `DESIGN.md`, prompt implementasi, screenshot, dan daftar asset publik.

## Stack

- Next.js 16 + React 19 + Tailwind CSS v4
- InsForge backend (Postgres + Storage)
- Playwright worker
- OpenRouter via InsForge AI setup (`openrouter/free` default)

## Setup

```bash
npm install
cp .env.example .env.local
npx @insforge/cli link --project-id 55334c9d-edeb-42d5-b547-7fc50e3d50c3
npx @insforge/cli db migrations up --all
npx @insforge/cli storage create-bucket screenshots -y
npx @insforge/cli ai setup
npx playwright install chromium
```

## Run lokal

Terminal 1:

```bash
npm run dev
```

Terminal 2:

```bash
npm run worker
```

Buka `http://localhost:3000`, submit URL publik, lalu lihat hasil di `/generations/<jobId>`.

## Checks

```bash
npm test
npm run lint
npm run build
```

## Notes

- Admin page dilindungi `ADMIN_TOKEN`.
- URL target divalidasi server-side dan worker-side untuk mencegah SSRF.
- Worker memblokir private/internal subresource request dari Playwright.
- Asset website target tetap mengikuti lisensi pemilik website.

<!-- test2 -->

<!-- test3 -->

<!-- test4 -->

<!-- test5 -->

<!-- test6 -->

<!-- test7 -->
