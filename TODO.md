# TODO

Status per 2026-09-27, setelah migrasi Next.js/InsForge/Apify -> TanStack Start +
Drizzle + Better Auth selesai (branch `feat/tanstack-start-drizzle-migration`).

- [x] tambahkan login dengan google — `src/auth/server.ts` (Google-only,
      `emailAndPassword` dimatikan), route `/api/auth/*` di
      `src/routes/api/auth.$.ts`, tombol di `src/routes/login.tsx`.
- [x] fitur pricing menggunakan midtrans sandbox — `createPayment` server
      function di `src/queries/entitlements.ts`, tombol di
      `src/components/pricing-cards.tsx`, integrasi di `src/lib/midtrans.ts`.
      Sandbox adalah default; produksi harus lewat flag, bukan edit kode.
- [x] tambahkan berbagai template designmd — `/template`, dengan gating
      `plans.templates_unlocked` + `getEntitlementFn()`.
- [x] tombol close untuk tutup hasil output scrap / DESIGN.md —
      `src/components/collapsible-output.tsx`, dipakai di
      `generation-result.tsx` (DESIGN.md) dan `scrape-detail.tsx` (hasil scrape).
      Melipat jadi panel kecil dengan "Tampilkan lagi"; state kerja tetap utuh
      karena job & scrape tinggal di PostgreSQL.
- [ ] midtrans sandbox -> beneran. **Butuh kredensial asli dari Anda**, bukan
      kode: set `MIDTRANS_PRODUCTION=true` di `.env.local` dan ganti
      `MIDTRANS_SERVER_KEY` dengan key live. Throttle dan_verifikasi callback
      sudah ada; yang belum pernah diuji adalah round trip ke Midtrans asli.
- [ ] user yang sudah login boleh akses halaman publik? **Sudah diputuskan:**
      boleh. Navigasi berubah (user dapat Home/History/Template/Pricing +
      dropdown profil dengan "Keluar"), anonim dapat nav publik + tombol
      "Masuk". Tidak ada pengalihan paksa. Header membaca session dari
      `beforeLoad` root, jadi tidak ada flash lagi.
- [ ] uji round trip login Google di browser sungguhan. Semua sudah benar secara
      konfigurasi dan teruji lewat HTTP, tapi belum ada yang benar-benar mengklik
      tombolnya. Ini satu-satunya bagian alur auth yang belum terbukti.
- [ ] rotasi Google OAuth client secret di Google Cloud Console. Secret yang
      sekarang pernah muncul di transkrip percakapan, jadi harus diganti.
