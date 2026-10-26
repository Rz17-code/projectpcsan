# PCSAN Otomatis (Next.js)

Hitung **qty pcs × harga jual per pcs (inc PPN)** dari data penjualan berformat **Nama | qty**.
Bundling dipecah otomatis sesuai Mapping Bundling.

---

## 1. Menjalankan di laptop (localhost)

**Persiapan (sekali saja)**
1. Install **Node.js versi LTS** dari https://nodejs.org (klik Next sampai selesai).
2. Ekstrak folder `pcsan-web` ke tempat tetap, misalnya `D:\pcsan-web`.

**Menjalankan**
1. Klik dua kali **`JALANKAN_PCSAN.bat`**.
   - Saat pertama kali, file ini memasang paket dan menyiapkan aplikasi (beberapa menit, butuh internet).
   - Browser akan terbuka di http://localhost:3000. Kalau halaman belum muncul, tekan F5.
2. Kalau Windows Firewall bertanya, klik **Allow access** (centang *Private network*).
3. **Jangan tutup jendela hitam** selama aplikasi dipakai.

**Akses dari laptop/HP teman**
- Teman harus berada di **WiFi/LAN yang sama**.
- Buka alamat yang muncul di jendela hitam, baris **"Untuk teman"**, contoh `http://192.168.1.25:3000`.

**Setelah kode diperbarui**, klik `UPDATE_BUILD_ULANG.bat`, lalu jalankan lagi `JALANKAN_PCSAN.bat`.

---

## 2. Cara pakai

| Menu | Fungsi |
|---|---|
| **Hitung PCSAN** | Upload Excel atau copy-paste kolom **Nama + qty**. Baris **Total Keseluruhan** dipakai untuk mengecek tidak ada baris yang terlewat. Klik baris produk untuk melihat asal qty-nya. |
| Nama merah | Nama barang yang belum dikenal **tidak dihitung**. Klik **Petakan**, periksa saran komponen, lalu Simpan. Setelah itu nama tersebut otomatis dikenali. |
| **Download Excel** | Berisi 3 sheet: HASIL PCSAN, RINCIAN BUNDLING, INPUT. |
| **Master Harga** | Ubah harga, tambah produk, atau import dari Excel dengan format `NAMA PRODUK` dan `HARGA JUAL (INC PPN)`. Klik **Simpan**. |
| **Mapping Bundling** | Daftar nama barang beserta produk dan jumlah pcs per 1 qty. |
| **Riwayat** | Hasil yang disimpan bisa dibuka semua pengguna. |

**Aturan hitung:** setiap komponen bundling mendapat *qty bundling × jumlah pcs komponen*.
Contoh: `BUNDLING NIACINAMIDE + ALPHA ARBUTIN` dengan qty 1.821 menjadi Niacinamide 1.821 dan Alpha Arbutin 1.821.
Contoh lain: `BUNDLING SERUM GLOW BOOSTER 2 PCS` dengan qty 25 menjadi 7 Active Ingredients 50.

---

## 3. Data & backup (mode localhost)

- `data/master.json` berisi master harga dan mapping. Saat pertama dijalankan, isinya disalin dari `data-awal/master.json`.
- `data/backup/` berisi backup otomatis setiap kali master diubah (100 terakhir).
- `data/riwayat/` berisi riwayat perhitungan.
- Untuk backup, cukup salin folder `data`.
- Kalau dua orang menyimpan master bersamaan, orang kedua diminta memuat ulang data terbaru, jadi tidak ada yang saling menimpa.

---

## 4. Nanti: GitHub & Vercel

**Push ke GitHub**
```bash
git init
git add .
git commit -m "PCSAN Otomatis"
git branch -M main
git remote add origin https://github.com/<akun>/pcsan-otomatis.git
git push -u origin main
```
Folder `data/`, `node_modules/`, dan `.next/` tidak ikut ter-upload karena sudah ada di `.gitignore`.

**Deploy ke Vercel**
- Di Vercel, file di server **tidak permanen**, sehingga mode `file` tidak bisa dipakai di sana. Aplikasi akan menampilkan pesan jelas kalau ini terjadi.
- Yang perlu ditambahkan cukup **satu adapter database** di `lib/storage.ts`, misalnya Supabase atau Vercel Postgres, lalu set environment variable `PCSAN_STORAGE` di Vercel.
- Halaman, API, dan logika hitung **tidak perlu diubah**.
- Isi `data/master.json` dari localhost bisa diimpor ke database supaya master dan mapping yang sudah dibuat tidak hilang.

---

## 5. Struktur kode

```
lib/pcsan.ts        logika inti (parsing Nama|qty, pecah bundling, hitung, saran mapping)
lib/storage.ts      penyimpanan data (adapter file; tempat adapter database nanti)
lib/excel.ts        baca/tulis Excel di browser
lib/api.ts          panggilan API dari browser
app/api/...         API: /api/master, /api/riwayat, /api/riwayat/[id]
components/...      halaman: Hitung, MasterHarga, MappingTab, MappingModal, Riwayat
data-awal/          master awal (harga dari file PCSAN + mapping GB & Kyura yang sudah dikonfirmasi)
```
