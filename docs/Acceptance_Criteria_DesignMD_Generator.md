# Acceptance Criteria — DesignMD Generator

**Versi:** 1.0 — Draft  
**Bahasa:** Indonesia  
**Dokumen:** Acceptance Criteria  
**Catatan desain UI:** Dokumen ini **tidak menentukan warna, font, logo, style card, atau detail visual aplikasi**. Semua detail desain visual aplikasi ditentukan oleh owner/designer.

---

## Ruang Lingkup Dokumen

Dokumen ini menjadi acuan QA dan development untuk memastikan aplikasi DesignMD Generator berjalan sesuai kebutuhan MVP.

Ruang lingkup acceptance criteria:

- URL input & validation
- Job queue & progress status
- Limited crawling
- Screenshot & page capture
- Design extraction
- Asset extraction
- `DESIGN.md` generation
- Implementation prompt generation
- Result preview & download
- Error handling
- Security & abuse prevention
- Admin monitoring
- Non-functional requirements
- Definition of Done

---

# 1. General Scope

## AC-1.1 Platform

- Aplikasi WAJIB berbasis web.
- Aplikasi WAJIB dapat dijalankan dengan Next.js sebagai fullstack framework.
- Backend API WAJIB dibuat menggunakan Next.js Route Handlers atau mekanisme server-side Next.js yang setara.
- Proses berat seperti crawling, screenshot, extraction, dan AI generation WAJIB berjalan melalui background job/worker, bukan blocking request utama.
- Worker boleh berada dalam repository yang sama dengan project Next.js.
- NestJS TIDAK wajib digunakan untuk MVP.

## AC-1.2 Bahasa UI

- UI aplikasi menggunakan Bahasa Indonesia atau bahasa yang dipilih owner.
- Pesan error harus mudah dipahami user non-teknis.
- Istilah teknis seperti `crawl`, `asset`, dan `DESIGN.md` boleh digunakan jika diberi konteks yang jelas.

## AC-1.3 Batasan Desain Visual

- Dokumen ini TIDAK mengatur warna aplikasi.
- Dokumen ini TIDAK mengatur font aplikasi.
- Dokumen ini TIDAK mengatur logo aplikasi.
- Dokumen ini TIDAK mengatur visual style landing page.
- Tim development hanya wajib memastikan UI responsive, accessible, dan usable.

---

# 2. URL Submission

## AC-2.1 Form Input URL

- User dapat memasukkan URL website target melalui form utama.
- Field URL wajib diisi.
- Placeholder atau helper text menjelaskan bahwa URL harus berupa website publik.
- Tombol submit tersedia untuk memulai proses generate.
- Tombol submit disabled saat field URL kosong atau saat request sedang diproses.
- Menekan Enter pada field URL memicu submit jika input valid.

## AC-2.2 Validasi Format URL

- Sistem menerima URL dengan protokol `http://` atau `https://`.
- Sistem menolak input yang bukan URL.
- Sistem menolak URL tanpa domain valid.
- Sistem menampilkan error inline jika URL tidak valid.
- Sistem tidak membuat job jika URL gagal validasi format.

## AC-2.3 Normalisasi URL

- Jika user memasukkan URL valid dengan trailing slash berbeda, sistem menyimpan normalized URL secara konsisten.
- Sistem menyimpan domain target untuk kebutuhan pembatasan crawling.
- Sistem tidak mengubah domain target menjadi domain lain tanpa redirect yang valid.
- Redirect harus dicatat dalam metadata job jika terjadi.

## AC-2.4 Submit Success

- Setelah submit sukses, sistem membuat job baru.
- Sistem mengembalikan `job_id`.
- User diarahkan ke halaman progress/result.
- Status awal job adalah `queued`.
- User tidak perlu menunggu proses generate selesai di request submit pertama.

---

# 3. Security Validation for Submitted URL

## AC-3.1 Protocol Restriction

- Sistem hanya menerima protokol `http` dan `https`.
- Sistem menolak protokol lain seperti `file`, `ftp`, `ssh`, `data`, dan sejenisnya.
- Pesan error tidak membocorkan detail internal server.

## AC-3.2 Private Network Blocking

- Sistem WAJIB menolak URL yang mengarah ke:
  - `localhost`
  - `127.0.0.1`
  - `0.0.0.0`
  - private IP range
  - internal hostname
  - metadata IP cloud provider
- Validasi dilakukan di server, bukan hanya frontend.
- Jika URL redirect ke private/internal address, proses harus dihentikan.

## AC-3.3 Redirect Limit

- Sistem membatasi jumlah redirect.
- Jika redirect melebihi batas, job gagal dengan error yang jelas.
- Redirect final tetap harus melewati validasi keamanan.
- Redirect ke domain berbeda boleh diproses hanya jika lolos validasi dan masih sesuai policy produk.

---

# 4. Job Creation & Queue

## AC-4.1 Job Record

- Setiap submit valid membuat satu record job di database.
- Job menyimpan:
  - source URL
  - normalized domain
  - status
  - progress
  - created timestamp
  - user/session identifier jika tersedia
  - max page setting
  - output language jika tersedia
- Job ID bersifat unik.

## AC-4.2 Queue Processing

- Job yang dibuat masuk ke queue.
- Worker mengambil job dari queue.
- Worker mengubah status job sesuai tahapan proses.
- Worker tidak memproses job yang sudah `completed`, `failed`, atau `cancelled`.
- Jika worker crash, job tidak boleh hilang tanpa status.

## AC-4.3 Job Status

Status yang didukung minimal:

- `queued`
- `crawling`
- `capturing`
- `extracting`
- `generating`
- `completed`
- `failed`

Setiap perubahan status disimpan di database.

## AC-4.4 Progress Display

- Halaman progress menampilkan status job terbaru.
- Progress dapat diperbarui melalui polling, SSE, atau mekanisme lain.
- Polling tidak boleh terlalu agresif; rekomendasi 2–5 detik.
- Jika job selesai, halaman menampilkan hasil.
- Jika job gagal, halaman menampilkan error state.

---

# 5. Limited Crawling

## AC-5.1 Crawl Limit

- MVP membatasi crawl maksimal 5 halaman per job.
- Crawl depth maksimal 1 dari URL awal.
- Sistem hanya mengambil halaman yang relevan dari domain target sesuai policy.
- Sistem tidak melakukan full-site crawling tanpa batas.
- Jika halaman internal lebih dari limit, sistem memilih halaman berdasarkan prioritas.

## AC-5.2 Page Priority

Crawler memprioritaskan:

1. URL awal
2. halaman yang terlihat seperti About
3. halaman yang terlihat seperti Pricing
4. halaman yang terlihat seperti Features/Product
5. halaman yang terlihat seperti Contact
6. halaman utama lain dari navigasi jika tersedia

## AC-5.3 Excluded Pages

Crawler tidak boleh secara sengaja memproses:

- halaman login
- halaman register
- halaman account
- halaman checkout
- halaman cart
- halaman payment
- halaman admin
- halaman yang membutuhkan autentikasi
- file executable
- endpoint API mentah yang bukan halaman web

## AC-5.4 Timeout

- Setiap halaman memiliki timeout.
- Jika satu halaman timeout, sistem boleh melanjutkan halaman lain.
- Jika semua halaman gagal, job menjadi `failed`.
- Error timeout ditampilkan dengan pesan yang dapat dipahami user.

---

# 6. Page Capture

## AC-6.1 Screenshot Desktop

- Sistem mengambil screenshot desktop untuk setiap halaman yang berhasil dianalisis.
- Screenshot disimpan ke storage.
- URL/path screenshot disimpan di database.
- Jika screenshot gagal tetapi HTML berhasil diambil, sistem tetap boleh melanjutkan extraction.
- Status partial failure dicatat di job log.

## AC-6.2 Screenshot Mobile

- Screenshot mobile bersifat opsional untuk MVP.
- Jika fitur mobile screenshot aktif, sistem menyimpan screenshot mobile terpisah.
- Jika mobile screenshot gagal, job tidak otomatis gagal selama data utama masih cukup.

## AC-6.3 HTML & Metadata Capture

- Sistem menyimpan atau mengekstrak HTML utama dari halaman.
- Sistem mengambil metadata seperti title, description, canonical URL jika tersedia.
- Sistem mencatat status code halaman.
- Sistem tidak menyimpan cookie/session rahasia dari website target.

## AC-6.4 CSS Capture

- Sistem mencoba membaca CSS yang terhubung dari halaman.
- Sistem boleh mengambil computed style dari browser automation.
- Jika CSS eksternal tidak dapat diakses, sistem tetap menghasilkan output berdasarkan data yang tersedia.
- Sistem tidak mengunduh CSS tanpa batas ukuran.

---

# 7. Design Extraction

## AC-7.1 Color Extraction from Target Website

- Sistem mendeteksi warna dari website target.
- Warna yang dideteksi berasal dari CSS/computed style/screenshot analysis jika tersedia.
- Sistem membedakan warna dominan, warna teks, warna background, dan warna CTA jika dapat dideteksi.
- Jika warna tertentu tidak dapat dipastikan, sistem menulis `Unknown` atau `Not detected`.
- Sistem tidak boleh mengarang warna yang tidak ditemukan.

## AC-7.2 Typography Extraction from Target Website

- Sistem mendeteksi font family dari CSS/computed style jika tersedia.
- Sistem mencatat heading/body font jika dapat dibedakan.
- Sistem mencatat font weight/size jika dapat dideteksi dengan cukup.
- Jika font tidak tersedia, sistem menulis `Not detected`.
- Sistem tidak boleh mengklaim font tertentu jika tidak ada bukti dari hasil extraction.

## AC-7.3 Layout Extraction

- Sistem mengidentifikasi struktur halaman seperti hero, navbar, section, card grid, footer, form, atau CTA section jika ditemukan.
- Sistem mencatat layout pattern yang muncul.
- Sistem mencatat responsive pattern hanya jika data/screenshot mendukung.
- Jika struktur tidak jelas, sistem memberi confidence note.

## AC-7.4 Component Extraction

- Sistem mendeteksi komponen umum seperti:
  - navigation/header
  - hero section
  - button/CTA
  - card
  - form
  - pricing block
  - testimonial block
  - footer
- Komponen yang tidak ditemukan tidak perlu dimasukkan.
- Sistem tidak boleh memaksakan semua komponen ada.

## AC-7.5 Confidence Notes

- Setiap hasil extraction yang tidak pasti harus diberi catatan.
- `DESIGN.md` harus memiliki section limitation/confidence.
- Sistem lebih baik menulis `Unknown` daripada mengarang.
- Jika hanya 1 halaman berhasil dianalisis, output harus menyebut keterbatasan tersebut.

---

# 8. Asset Extraction

## AC-8.1 Asset Discovery

Sistem mencari asset publik dari:

- HTML image tag
- CSS background image
- favicon
- font URL
- Open Graph image
- screenshot hasil capture

## AC-8.2 Asset Metadata

Setiap asset minimal menyimpan:

- tipe asset
- source URL
- halaman asal
- filename/label
- MIME type jika tersedia
- ukuran file jika tersedia
- status download
- storage URL jika berhasil disimpan

## AC-8.3 Asset Download Limit

- Sistem membatasi jumlah asset per job.
- Sistem membatasi ukuran maksimal per asset.
- Sistem tidak menyimpan file executable.
- Sistem tidak mengikuti download tak terbatas.
- Asset yang gagal diunduh tetap boleh dicatat sebagai metadata.

## AC-8.4 Asset Display

- Result page menampilkan daftar asset yang ditemukan.
- Asset image yang berhasil disimpan dapat memiliki preview.
- Font asset ditampilkan sebagai nama family/URL jika terdeteksi.
- Sistem menampilkan disclaimer bahwa penggunaan asset mengikuti lisensi pemilik website target.

---

# 9. DESIGN.md Generation

## AC-9.1 Output Availability

- Setelah job selesai, sistem menampilkan `DESIGN.md`.
- `DESIGN.md` dapat disalin ke clipboard.
- `DESIGN.md` dapat diunduh sebagai file `.md`.
- Filename default: `DESIGN.md`.

## AC-9.2 Required Sections

`DESIGN.md` minimal berisi:

1. Source Website
2. Analysis Summary
3. Pages Analyzed
4. Visual Style Overview
5. Colors Detected
6. Typography Detected
7. Layout Structure
8. UI Components
9. Assets
10. Implementation Notes
11. Limitations & Confidence Notes

## AC-9.3 Source Traceability

- `DESIGN.md` mencantumkan URL sumber utama.
- `DESIGN.md` mencantumkan daftar halaman yang berhasil dianalisis.
- Jika data berasal dari halaman tertentu, output sebaiknya menyebut halaman asal.
- Jika ada halaman gagal, output menyebut jumlah halaman yang gagal atau tidak dianalisis.

## AC-9.4 No Fabrication

- AI tidak boleh mengarang data yang tidak tersedia dari extraction.
- Jika font/warna/layout tidak dapat dipastikan, output harus menyatakan tidak terdeteksi.
- Jika website target tidak memiliki cukup data, output harus tetap jujur tentang keterbatasan.
- Output tidak boleh menyatakan hasil sebagai 100% akurat.

## AC-9.5 Markdown Quality

- Markdown valid dan rapi.
- Heading menggunakan struktur yang konsisten.
- Tidak ada HTML/CSS mentah yang terlalu panjang.
- Tidak ada prompt internal/system prompt yang bocor ke output.
- Tidak ada secret/token/cookie yang masuk ke output.

---

# 10. Implementation Prompt Generation

## AC-10.1 Output Availability

- Sistem menghasilkan prompt implementasi setelah job selesai.
- Prompt dapat disalin ke clipboard.
- Prompt dapat diunduh sebagai file `.md`.
- Filename default: `IMPLEMENTATION_PROMPT.md`.

## AC-10.2 Prompt Content

Prompt minimal berisi:

- konteks bahwa user ingin membuat website baru
- ringkasan style dari hasil analisis
- struktur halaman yang disarankan
- daftar komponen yang perlu dibuat
- catatan asset/reference
- batasan agar tidak menyalin brand/logo/konten target secara ilegal
- format output yang diharapkan dari AI coding assistant

## AC-10.3 Prompt Safety

- Prompt tidak boleh meminta AI untuk melakukan plagiarisme brand secara mentah.
- Prompt tidak boleh meminta penggunaan logo/asset target tanpa izin.
- Prompt harus menggunakan bahasa “inspired by/reference style”, bukan “copy exactly”, kecuali user menyatakan memiliki izin.
- Prompt tidak boleh menyertakan data rahasia.

---

# 11. Result Page

## AC-11.1 Result Summary

Halaman result menampilkan:

- source URL
- status job
- waktu dibuat
- durasi proses jika tersedia
- jumlah halaman dianalisis
- jumlah asset ditemukan
- error message jika gagal

## AC-11.2 DESIGN.md Preview

- Preview `DESIGN.md` tampil dalam format markdown readable.
- User dapat scroll isi markdown panjang.
- User dapat copy seluruh markdown.
- User dapat download markdown.
- Jika hasil belum tersedia, area preview menampilkan loading/progress state.

## AC-11.3 Prompt Preview

- Preview prompt implementasi tersedia.
- User dapat copy prompt.
- User dapat download prompt.
- Prompt ditampilkan terpisah dari `DESIGN.md`.

## AC-11.4 Asset List

- Asset list tampil setelah job selesai atau partial selesai.
- Asset memiliki label tipe.
- Asset image dapat dipreview jika tersedia.
- Asset yang gagal diunduh diberi status jelas.
- User dapat melihat source URL asset jika policy produk memperbolehkan.

## AC-11.5 Retry Action

- Job gagal menampilkan tombol retry.
- Retry membuat job baru atau menjalankan ulang job sesuai keputusan implementasi.
- Job lama tetap tersimpan dengan status `failed`.
- User dapat melihat bahwa job retry berasal dari job sebelumnya.

---

# 12. Download & Export

## AC-12.1 Download DESIGN.md

- User dapat mengunduh file `DESIGN.md`.
- File yang diunduh berisi output yang sama dengan preview.
- Content-Type sesuai untuk file markdown/text.
- Jika job belum selesai, endpoint download mengembalikan error yang jelas.

## AC-12.2 Download Prompt

- User dapat mengunduh file `IMPLEMENTATION_PROMPT.md`.
- File yang diunduh berisi prompt yang sama dengan preview.
- Jika prompt belum tersedia, sistem menampilkan error yang jelas.

## AC-12.3 Download Asset JSON

- Sistem dapat menyediakan export asset metadata dalam JSON.
- JSON minimal berisi daftar asset, tipe, source URL, halaman asal, dan status.
- Export asset JSON boleh masuk Phase 2 jika belum MVP.

## AC-12.4 ZIP Export

- ZIP export bersifat opsional untuk MVP.
- Jika tersedia, ZIP minimal berisi:
  - `DESIGN.md`
  - `IMPLEMENTATION_PROMPT.md`
  - `assets.json`
  - screenshot yang berhasil disimpan
- ZIP tidak boleh berisi file berbahaya.

---

# 13. History

## AC-13.1 Job History List

- Jika fitur history aktif, user dapat melihat daftar generate sebelumnya.
- Riwayat menampilkan URL, tanggal, status, dan link result.
- Riwayat dapat berbasis akun atau session/browser sesuai keputusan MVP.
- Job yang dihapus/expired tidak tampil lagi.

## AC-13.2 Retention

- Sistem memiliki kebijakan retention hasil generate.
- Hasil anonymous dapat dihapus otomatis setelah periode tertentu.
- Hasil authenticated user dapat disimpan lebih lama jika fitur akun tersedia.
- User harus memahami jika hasil dapat kedaluwarsa.

---

# 14. Admin Monitoring

## AC-14.1 Admin Access

- Halaman admin hanya dapat diakses owner/admin.
- Endpoint admin dilindungi authentication.
- User biasa/anonymous tidak dapat membuka data job global.
- Akses tidak sah menerima response 401/403 sesuai kondisi.

## AC-14.2 Job Monitoring

Admin dapat melihat:

- daftar job terbaru
- status job
- URL target
- waktu dibuat
- durasi proses
- error code
- jumlah halaman dianalisis
- jumlah asset ditemukan

## AC-14.3 Error Logs

- Admin dapat melihat log job gagal.
- Log cukup informatif untuk debugging.
- Log tidak boleh menampilkan secret, cookie, token, atau informasi sensitif.
- Admin dapat mencari/filter berdasarkan status atau error code jika tersedia.

## AC-14.4 Moderation Action

- Admin dapat menghapus result/job bermasalah jika diperlukan.
- Penghapusan mencatat timestamp dan admin yang melakukan aksi jika auth tersedia.
- Penghapusan tidak boleh menghapus job lain secara tidak sengaja.

---

# 15. Error Handling

## AC-15.1 Invalid URL Error

- Input URL invalid menampilkan pesan error sebelum job dibuat.
- Tidak ada record job dibuat untuk validasi client-side yang gagal.
- Validasi server tetap berjalan walaupun client-side validation dilewati.

## AC-15.2 Fetch Timeout Error

- Jika website terlalu lama merespons, sistem menandai job failed atau partial sesuai kondisi.
- User melihat pesan bahwa website terlalu lama merespons.
- Tombol retry tersedia.

## AC-15.3 Website Blocked Error

- Jika website menolak akses crawler, sistem menampilkan error yang jelas.
- Sistem tidak mencoba bypass proteksi.
- User dapat mencoba URL lain.

## AC-15.4 Not Enough Content Error

- Jika HTML/CSS tidak cukup untuk dianalisis, sistem menampilkan error `NO_ANALYZABLE_CONTENT`.
- User diberi saran untuk mencoba halaman publik yang lebih lengkap.
- Sistem tidak membuat `DESIGN.md` palsu.

## AC-15.5 AI Failure Error

- Jika AI generation gagal, job ditandai failed atau retry internal sesuai implementasi.
- Error tidak menampilkan detail API key/provider.
- User dapat retry.

## AC-15.6 Partial Success

- Jika sebagian halaman berhasil dan sebagian gagal, sistem tetap boleh menghasilkan result.
- Result wajib mencantumkan keterbatasan.
- Job dapat berstatus `completed` dengan warning atau status setara jika tersedia.

---

# 16. Rate Limiting & Abuse Prevention

## AC-16.1 Submit Rate Limit

- Endpoint submit URL memiliki rate limit.
- Jika rate limit terlampaui, sistem menolak request dengan pesan jelas.
- Rate limit dicek di server.
- Rate limit dapat berbasis IP, user ID, atau session.

## AC-16.2 Job Limit

- Sistem membatasi jumlah job aktif per user/IP.
- Jika user memiliki terlalu banyak job aktif, request baru ditolak sementara.
- Pesan error menjelaskan bahwa user perlu menunggu job sebelumnya selesai.

## AC-16.3 Resource Limit

- Sistem membatasi:
  - jumlah halaman
  - ukuran HTML/CSS
  - jumlah asset
  - ukuran asset
  - durasi browser automation
  - jumlah retry
- Jika limit tercapai, sistem berhenti dengan status yang jelas.

---

# 17. Data & Storage

## AC-17.1 Database Persistence

- Job tersimpan di database.
- Crawled page metadata tersimpan di database.
- Asset metadata tersimpan di database.
- Generated document tersimpan di database atau storage.
- Job log tersimpan untuk debugging.

## AC-17.2 Storage

- Screenshot disimpan di storage.
- Asset yang berhasil diunduh disimpan di storage jika fitur aktif.
- Storage URL/path dikaitkan dengan job.
- File yang gagal disimpan tidak membuat seluruh job gagal jika masih ada data cukup.

## AC-17.3 Data Cleanup

- Sistem memiliki mekanisme cleanup untuk file/job expired.
- Cleanup tidak boleh menghapus data job yang masih aktif.
- Cleanup harus mencatat error jika gagal.

---

# 18. Non-Functional Requirements

## AC-18.1 Performance

- Submit URL memberikan response awal maksimal 2 detik dalam kondisi normal.
- Proses generate berjalan async.
- Job MVP untuk maksimal 5 halaman idealnya selesai dalam 1–3 menit, tergantung target website dan AI provider.
- Halaman result tetap responsif saat markdown panjang.
- Polling status tidak membebani server secara berlebihan.

## AC-18.2 Reliability

- Tidak ada job yang stuck tanpa status final melebihi batas waktu yang ditentukan.
- Worker retry tidak menyebabkan duplikasi dokumen yang membingungkan.
- Job gagal menyimpan error code.
- Job partial success mencatat warning.
- Retry job dapat dilacak dari job asal.

## AC-18.3 Security

- URL validation dilakukan di server.
- Private/internal network diblokir.
- Rate limit aktif.
- Admin route dilindungi auth.
- Input user disanitasi.
- Output markdown tidak mengandung secret/cookie/token.
- Sistem tidak menjalankan file dari website target.

## AC-18.4 Browser Support

- Aplikasi dapat digunakan di browser modern.
- Minimal mendukung Chrome, Edge, Firefox, dan Safari versi modern.
- Layout harus responsive di mobile, tablet, dan desktop.
- Kriteria ini tidak menentukan pilihan warna/font.

## AC-18.5 Accessibility

- Form memiliki label.
- Error message dapat dibaca screen reader.
- Tombol dapat diakses keyboard.
- Status progress memiliki teks, bukan hanya indikator visual.
- Copy/download button memiliki label yang jelas.

---

# 19. Testing Requirements

## AC-19.1 Unit Test

Unit test minimal mencakup:

- URL validation
- private IP detection
- redirect validation
- job status transition
- markdown formatter
- asset filtering

## AC-19.2 Integration Test

Integration test minimal mencakup:

- submit URL valid
- submit URL invalid
- create job
- update job status
- failed job handling
- result retrieval
- download markdown

## AC-19.3 Worker Test

Worker test minimal mencakup:

- crawl satu halaman publik mock
- timeout handling
- partial page failure
- extraction fallback
- AI generation failure
- storage failure

## AC-19.4 Manual QA Scenario

Manual QA minimal:

1. User submit URL valid.
2. User melihat progress.
3. Job selesai.
4. User melihat `DESIGN.md`.
5. User copy markdown.
6. User download markdown.
7. User melihat prompt.
8. User melihat asset list.
9. User submit URL invalid.
10. User melihat error.
11. User retry job gagal.
12. Admin melihat job log.

---

# 20. Deliverables

## AC-20.1 MVP Deliverables

MVP dianggap lengkap jika tersedia:

1. Next.js web app.
2. URL input page.
3. API create generation job.
4. Job queue/worker.
5. Limited crawler.
6. Screenshot capture.
7. Basic extraction.
8. AI `DESIGN.md` generation.
9. AI prompt generation.
10. Result page.
11. Copy/download markdown.
12. Error handling.
13. Rate limit dasar.
14. Admin monitoring dasar.
15. Database schema.
16. Storage setup.
17. README setup project.

## AC-20.2 Documentation

Dokumentasi minimal mencakup:

- cara menjalankan project lokal
- environment variables
- cara menjalankan worker
- struktur folder
- API endpoint
- database migration
- cara testing
- batasan MVP

---

# 21. Definition of Done

Fitur dinyatakan DONE jika:

1. Semua acceptance criteria terkait fitur tersebut terpenuhi.
2. Tidak ada bug Critical/High yang terbuka.
3. Validasi client dan server berjalan.
4. Endpoint utama memiliki test minimal.
5. Worker berhasil memproses job end-to-end.
6. `DESIGN.md` berhasil dibuat dari URL publik sederhana.
7. Prompt implementasi berhasil dibuat.
8. Download markdown berhasil.
9. Error state diuji.
10. Rate limit diuji.
11. SSRF protection dasar diuji.
12. Admin dapat melihat job dan error.
13. UI responsive dan accessible secara dasar.
14. Detail visual UI tetap mengikuti keputusan owner/designer, bukan dokumen ini.
