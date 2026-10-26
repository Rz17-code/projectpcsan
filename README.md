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
| **Screenshot** | Tekan **Ctrl+V** (setelah Win+Shift+S) atau seret gambar ke kotak upload. Teks dibaca otomatis (OCR, butuh internet saat pertama dipakai) dan ditampilkan di samping gambarnya. Cocokkan, betulkan yang salah baca di kotak teks, lalu **Hitung ulang**. Ikutkan baris **Total Keseluruhan** di screenshot supaya salah baca ketahuan. |
| **Hitung PCSAN** | Upload Excel atau copy-paste kolom **Nama + qty**. Baris **Total Keseluruhan** dipakai untuk mengecek tidak ada baris yang terlewat. Klik baris produk untuk melihat asal qty-nya. |
| Nama merah | Nama barang yang belum dikenal **tidak dihitung**. Klik **Petakan**, periksa saran komponen, lalu Simpan. Setelah itu nama tersebut otomatis dikenali. |
| **Download Excel** | Berisi 3 sheet: HASIL PCSAN, RINCIAN BUNDLING, INPUT. |
| **Master Harga** | Ubah harga, tambah produk, atau import dari Excel dengan format `NAMA PRODUK` dan `HARGA JUAL (INC PPN)`. Klik **Simpan**. |
| **Mapping Bundling** | Daftar nama barang beserta produk dan jumlah pcs per 1 qty. |
| **Nama & Keterangan** | Sebelum input, **pilih Nama Anda** (dropdown kanan atas, daftar di `lib/tim.ts`) dan **isi Keterangan**. Tanpa keduanya, upload/paste/screenshot terkunci. Setelah ada data, klik **＋ Input baru** untuk data berikutnya. |
| **Riwayat** | Setiap input **otomatis tersimpan** (nama, keterangan, waktu WIB). Mengubah keterangan, memetakan nama, atau koreksi lalu **Hitung ulang** memperbarui entri yang sama. Filter berdasarkan nama, bulan, tanggal, atau keterangan. |
| **Rekap** | Di tab Riwayat: centang entri (tanpa centang = semua yang tampil sesuai filter) → **Lihat rekap** (total per produk, klik produk untuk rincian per keterangan) atau **Export rekap ke Excel** (sheet: rekap per produk, pcs & nilai per keterangan, daftar entri, detail). |

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

Di Vercel, file di server **tidak permanen**, jadi data disimpan di database **Upstash Redis** (gratis).

1. Buka project di Vercel → tab **Storage** → **Create Database** / **Connect** → pilih **Upstash for Redis** (Marketplace) → hubungkan ke project ini.
   Kunci koneksi (`KV_REST_API_URL`, `KV_REST_API_TOKEN`) otomatis masuk ke Environment Variables.
2. **Settings → Environment Variables** → tambah `PCSAN_PASSWORD` = password bersama tim (pakai yang panjang, jangan yang mudah ditebak).
3. **Deployments** → titik tiga di deploy terbaru → **Redeploy** (environment variable baru hanya terbaca setelah deploy ulang).

Catatan:
- Saat pertama dibuka, master harga & mapping diisi dari `data-awal/master.json`. Master/riwayat yang dibuat di localhost **tidak** otomatis ikut.
- Backup master (100 versi terakhir) disimpan di Redis pada kunci `pcsan:master:backup`.
- Mengganti `PCSAN_PASSWORD` (lalu Redeploy) otomatis mengeluarkan semua orang yang sudah login.
- Di localhost, `PCSAN_PASSWORD` biasanya kosong = tanpa password, dan data tetap di folder `data/`.

---

## 5. Struktur kode

```
tests/              tes logika hitung, jalankan dengan: npm test
lib/pcsan.ts        logika inti (parsing Nama|qty, pecah bundling, hitung, saran mapping)
lib/storage.ts      penyimpanan data (adapter file; tempat adapter database nanti)
lib/excel.ts        baca/tulis Excel di browser
lib/api.ts          panggilan API dari browser
app/api/...         API: /api/master, /api/riwayat, /api/riwayat/[id]
components/...      halaman: Hitung, MasterHarga, MappingTab, MappingModal, Riwayat
data-awal/          master awal (harga dari file PCSAN + mapping GB & Kyura yang sudah dikonfirmasi)
```
