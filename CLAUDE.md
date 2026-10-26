# PCSAN Otomatis — catatan untuk agent

Pengguna berkomunikasi dalam **Bahasa Indonesia**. Aplikasi Next.js 15 (App Router, TypeScript), dijalankan di localhost Windows
(`JALANKAN_PCSAN.bat`, port 3000, bind 0.0.0.0 agar teman satu LAN bisa akses). Rencana berikutnya: deploy ke Vercel.

## Tujuan
"PCSAN" = menghitung **qty pcs per produk × harga jual per pcs (inc PPN)** dari data penjualan berformat **Nama | qty**
(biasanya pivot Excel dengan baris terakhir "Total Keseluruhan").

## Aturan bisnis (sudah dikonfirmasi pengguna — jangan diubah tanpa konfirmasi)
- Bundling dipecah per komponen; **setiap komponen mendapat qty bundling × jumlah pcs komponen**.
  Contoh: `BUNDLING SERUM GB NIACINAMIDE + ALPHA ARBUTIN` qty 1.821 → Niacinamide 10% 1.821 dan Alpha Arbutin 2% 1.821.
- `BUNDLING SERUM GLOW BOOSTER 2 PCS` qty 25 → Serum GB 7 Active Ingredients 50; `3 PCS` qty 4 → 12.
- Alias: "Serum Glow Booster" = Serum GB 7 Active Ingredients; "PDRN" = Serum GB PDRN;
  "GLOWBOOSTER SUNSCREEN 30 ML / 60 ML" = GB Sunscreen 30gr / 60gr (hanya beda satuan).
- KYURA BARRIER KIT = Barrier Serum + Cream + Toner; KYURA ACNE KIT = Acne Serum + Cream + Toner + Spot.
- REMOLE, QUZI BLACK, QUZI WHITE memang belum punya harga (kosong) — tampilkan peringatan, nilai = 0.
- Nama barang yang tidak dikenal **tidak boleh ditebak**: tandai, jangan dihitung, minta pengguna memetakan.
  **Pengecualian (diminta pengguna 2026-10-26):** nama yang DIAWALI nama produk/mapping yang ada (mis. "NEI Peeling Spray" → NEI)
  dikenali otomatis (`cocokAwalan`), ikut dihitung, diberi label oranye "otomatis" + tombol Konfirmasi. TIDAK berlaku bila sisa
  nama berisi tanda paket (+, &, PCS, KIT, SET, FREE, BONUS, BUNDLING, ISI, ...) atau angka lepas tanpa satuan — itu tetap manual.
- Harga di master sudah **termasuk PPN**.

## Angka acuan untuk pengujian (data GB, input total 2.976)
Total **5.068 pcs**, **Rp 83.412.800**. Per produk: 7 Active 126, AHA BHA PHA 6, Alpha Arbutin 2.096, Niacinamide 2.079,
Salicylic 8, Vit C + Collagen 155, Retinol 27, Sunscreen 30gr 350, Sunscreen 60gr 193, PDRN 28.

## Struktur kode
- `lib/pcsan.ts` — logika inti murni (parsing, resolve mapping, hitung, saran mapping). Ubah aturan hitung di sini saja.
- `lib/storage.ts` — SATU-SATUNYA tempat akses data. Adapter `file` (folder `./data`, untuk localhost) dan `redis`
  (Upstash, untuk Vercel — pilihan pengguna, bukan Supabase). Redis dipakai otomatis bila `KV_REST_API_URL`/`KV_REST_API_TOKEN`
  (atau `UPSTASH_REDIS_REST_*`) ada; mode `file` sengaja error di Vercel. Simpan master = skrip Lua atomik (cek versi + backup + set).
  Klien Upstash memakai auto-pipelining; `automaticDeserialization: false`, JSON diurus sendiri.
- `middleware.ts` + `lib/auth.ts` + `app/login` + `app/api/login` — password bersama via env `PCSAN_PASSWORD`
  (kosong = tanpa login). Cookie = SHA-256 dari password.
- `lib/excel.ts` — baca/tulis Excel di browser (SheetJS 0.18.5). `lib/api.ts` — fetch ke API.
- `lib/ocr.ts` — input dari screenshot (Tesseract.js, pilihan pengguna: gratis, bukan Claude API). Gambar diperbesar ke ±1600px + abu-abu
  sebelum OCR (tanpa ini banyak salah baca). Pembersihan teks OCR → Nama|qty ada di `rapikanTeksOcr` (`lib/pcsan.ts`, dites).
  Hasil OCR selalu ditampilkan untuk dicek; jangan pernah "membetulkan" nama hasil OCR secara otomatis.
- `app/api/master` (GET/POST dengan cek `versi` → 409 jika konflik), `app/api/riwayat`, `app/api/riwayat/[id]`.
- `components/` — App (tab), Hitung, MasterHarga, MappingTab, MappingModal, Riwayat.
- `data-awal/master.json` — seed master (49 produk dari file harga pengguna + 12 mapping). Hanya dipakai jika `data/master.json` belum ada.
- `data/` tidak masuk git (data hidup pengguna) — jangan dihapus/ditimpa.

## Catatan Windows
- Pengguna memakai Windows; launcher `.bat` harus CRLF. Hindari folder OneDrive (npm install bisa gagal).
- Setelah ubah kode: `npm run build` lalu `npm start` (atau `UPDATE_BUILD_ULANG.bat`).
- Tes logika inti: `npm test` (`tests/pcsan.test.mjs`, node:test bawaan Node 24 — tanpa paket tambahan). Wajib lulus setelah mengubah `lib/pcsan.ts`.
  Di PowerShell yang memblokir skrip, pakai `npm.cmd test`.
- Harga dari input pengguna/Excel dibaca dengan `parseHarga` (bukan `parseQty`): isian tidak terbaca → `undefined` → ditolak, harga lama dipertahankan.
