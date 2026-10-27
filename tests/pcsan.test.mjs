// Tes logika inti PCSAN (lib/pcsan.ts) memakai master awal di data-awal/master.json.
// Jalankan: npm test
import { test } from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { angkaOcr, cariDobel, cocokAwalan, hitung, parseHarga, parseQty, pasteToRows, rapikanTeksOcr, resolve, rekapRiwayat, rowsToInput, saran, selaraskanDenganTotal, sidikInput } from "../lib/pcsan.ts";

const master = JSON.parse(readFileSync(new URL("../data-awal/master.json", import.meta.url), "utf8"));
const pcs = (H, nama) => H.baris.find((b) => b.nama === nama).pcs;

test("parseQty: format angka Indonesia & Excel", () => {
  assert.equal(parseQty("1.821"), 1821);
  assert.equal(parseQty("1,821"), 1821);
  assert.equal(parseQty(1821), 1821);
  assert.equal(parseQty("-"), 0);
  assert.equal(parseQty("abc"), null);
});

test("parseHarga: Rp, ribuan, kosong, dan isian yang tidak terbaca", () => {
  assert.equal(parseHarga("Rp 25.000"), 25000);
  assert.equal(parseHarga("Rp15.100,-"), 15100);
  assert.equal(parseHarga("16.650"), 16650);
  assert.equal(parseHarga(16650), 16650);
  assert.equal(parseHarga(""), null);
  assert.equal(parseHarga("-"), null);
  assert.equal(parseHarga(null), null);
  // salah ketik TIDAK boleh diam-diam jadi harga kosong
  assert.equal(parseHarga("25.000a"), undefined);
  assert.equal(parseHarga("dua puluh ribu"), undefined);
  assert.equal(parseHarga(-5000), undefined);
});

test("rowsToInput: kolom Nama/qty, baris Total Keseluruhan dipakai sebagai cek", () => {
  const r = rowsToInput([
    ["Laporan Oktober"],
    ["Nama", "qty"],
    ["PDRN", "28"],
    ["(blank)", 3],
    ["GLOWBOOSTER SUNSCREEN 30 ML", 350],
    ["Total Keseluruhan", "378"],
  ]);
  assert.deepEqual(r.out, [{ nama: "PDRN", qty: 28 }, { nama: "GLOWBOOSTER SUNSCREEN 30 ML", qty: 350 }]);
  assert.equal(r.total, 378);
});

test("pasteToRows: hasil copy dari Excel (dipisah TAB)", () => {
  const r = rowsToInput(pasteToRows("PDRN\t28\r\nKYURA ACNE KIT\t1.200\n"));
  assert.deepEqual(r.out, [{ nama: "PDRN", qty: 28 }, { nama: "KYURA ACNE KIT", qty: 1200 }]);
});

test("resolve: huruf besar/kecil & spasi ganda diabaikan", () => {
  assert.equal(resolve(master, "  serum   glow booster ").cara, "mapping");
  assert.equal(resolve(master, "serum gb pdrn").cara, "langsung");
  assert.equal(resolve(master, "PRODUK MISTERI"), null);
});

test("aturan bundling (dari CLAUDE.md)", () => {
  const H = hitung(master, [
    { nama: "BUNDLING SERUM GB NIACINAMIDE + ALPHA ARBUTIN", qty: 1821 },
    { nama: "BUNDLING SERUM GLOW BOOSTER 2 PCS", qty: 25 },
    { nama: "BUNDLING SERUM GLOW BOOSTER 3 PCS", qty: 4 },
    { nama: "KYURA ACNE KIT", qty: 3 },
    { nama: "KYURA BARRIER KIT", qty: 2 },
  ], null);
  assert.equal(pcs(H, "Serum GB Niacinamide 10%"), 1821);
  assert.equal(pcs(H, "Serum GB Alpha Arbutin 2%"), 1821);
  assert.equal(pcs(H, "Serum GB 7 Active Ingredients"), 50 + 12);
  for (const p of ["KYURA ACNE SERUM", "KYURA ACNE CREAM", "KYURA ACNE TONER", "KYURA ACNE SPOT"]) assert.equal(pcs(H, p), 3);
  for (const p of ["KYURA BARRIER SERUM", "KYURA BARRIER CREAM", "KYURA BARRIER TONER"]) assert.equal(pcs(H, p), 2);
});

test("alias: Serum Glow Booster, PDRN, Sunscreen ML = gr", () => {
  const H = hitung(master, [
    { nama: "Serum Glow Booster", qty: 10 },
    { nama: "PDRN", qty: 28 },
    { nama: "GLOWBOOSTER SUNSCREEN 30 ML", qty: 350 },
    { nama: "GLOWBOOSTER SUNSCREEN 60 ML", qty: 193 },
  ], null);
  assert.equal(pcs(H, "Serum GB 7 Active Ingredients"), 10);
  assert.equal(pcs(H, "Serum GB PDRN"), 28);
  assert.equal(pcs(H, "GB Sunscreen 30gr"), 350);
  assert.equal(pcs(H, "GB Sunscreen 60gr"), 193);
});

test("nama tidak dikenal TIDAK dihitung; produk tanpa harga bernilai 0", () => {
  const H = hitung(master, [
    { nama: "PRODUK MISTERI", qty: 7 },
    { nama: "REMOLE", qty: 5 },
    { nama: "PDRN", qty: 2 },
  ], 14);
  assert.deepEqual(H.unknown, [{ nama: "PRODUK MISTERI", qty: 7 }]);
  assert.equal(H.total_input, 14);
  assert.equal(H.total_pcs, 7);
  const remole = H.baris.find((b) => b.nama === "REMOLE");
  assert.equal(remole.harga, null);
  assert.equal(remole.nilai, 0);
  assert.equal(H.total_nilai, 2 * 16650);
});

test("campuran bundling + alias + tanpa harga + tidak dikenal", () => {
  const H = hitung(master, [
    { nama: "BUNDLING SERUM GB NIACINAMIDE + ALPHA ARBUTIN", qty: 1821 },
    { nama: "BUNDLING SERUM GLOW BOOSTER 2 PCS", qty: 25 },
    { nama: "BUNDLING SERUM GLOW BOOSTER 3 PCS", qty: 4 },
    { nama: "serum  glow booster", qty: 10 },
    { nama: "GLOWBOOSTER SUNSCREEN 30 ML", qty: 350 },
    { nama: "PDRN", qty: 28 },
    { nama: "KYURA ACNE KIT", qty: 3 },
    { nama: "REMOLE", qty: 5 },
    { nama: "PRODUK MISTERI", qty: 7 },
  ], 2253);
  assert.equal(H.total_input, 2253);
  assert.equal(H.total_pcs, 4109);
  assert.equal(H.total_nilai, 66_611_700);
});

test("angka acuan GB di CLAUDE.md: 5.068 pcs, Rp 83.412.800 (cek harga master)", () => {
  const acuan = {
    "Serum GB 7 Active Ingredients": 126, "Serum GB AHA BHA PHA": 6, "Serum GB Alpha Arbutin 2%": 2096,
    "Serum GB Niacinamide 10%": 2079, "Serum GB Salicylic Acid 2%": 8, "Serum GB Vitamin C + Collagen": 155,
    "Serum GB Retinol 1%": 27, "GB Sunscreen 30gr": 350, "GB Sunscreen 60gr": 193, "Serum GB PDRN": 28,
  };
  const H = hitung(master, Object.entries(acuan).map(([nama, qty]) => ({ nama, qty })), null);
  assert.equal(H.total_pcs, 5068);
  assert.equal(H.total_nilai, 83_412_800);
});

test("rapikanTeksOcr: teks hasil OCR screenshot pivot -> Nama|qty", () => {
  const ocr = [
    "Label Baris | Jumlah dari qty",
    "| BUNDLING SERUM GB NIACINAMIDE + ALPHA ARBUTIN | 1.821 |",
    "GLOWBOOSTER SUNSCREEN 30 ML   35O",   // O dibaca sebagai huruf
    "PDRN  2l",                            // 1 dibaca sebagai l
    "KYURA ACNE KIT",                      // qty tidak terbaca
    "Total Keseluruhan 2.176",
  ].join("\n");
  const r = rapikanTeksOcr(ocr);
  assert.deepEqual(r.tanpaAngka, ["Label Baris | Jumlah dari qty", "KYURA ACNE KIT"]);
  const inp = rowsToInput(pasteToRows(r.teks));
  assert.deepEqual(inp.out, [
    { nama: "BUNDLING SERUM GB NIACINAMIDE + ALPHA ARBUTIN", qty: 1821 },
    { nama: "GLOWBOOSTER SUNSCREEN 30 ML", qty: 350 },
    { nama: "PDRN", qty: 21 },
  ]);
  assert.equal(inp.total, 2176);
});

test("rapikanTeksOcr: angka di dalam nama tidak dianggap qty", () => {
  const r = rapikanTeksOcr("BUNDLING SERUM GLOW BOOSTER 2 PCS 25\nSerum GB Retinol 1% 27\nGB Sunscreen 60gr 193");
  assert.deepEqual(rowsToInput(pasteToRows(r.teks)).out, [
    { nama: "BUNDLING SERUM GLOW BOOSTER 2 PCS", qty: 25 },
    { nama: "Serum GB Retinol 1%", qty: 27 },
    { nama: "GB Sunscreen 60gr", qty: 193 },
  ]);
});

test("data GB lengkap (screenshot contoh pengguna): bundling dipecah -> 5.068 pcs, Rp 83.412.800", () => {
  const teks = [
    "Nama\tqty",
    "BUNDLING SERUM GB NIACINAMIDE + ALPHA ARBUTIN\t1.821",
    "BUNDLING SERUM GB NIACINAMIDE + ALPHA ARBUTIN + Vit C Collagen\t99",
    "BUNDLING SERUM GB RETINOL + VIT C COLLAGEN\t19",
    "BUNDLING SERUM GLOW BOOSTER 2 PCS\t25",
    "BUNDLING SERUM GLOW BOOSTER 3 PCS\t4",
    "GLOWBOOSTER SUNSCREEN 30 ML\t350",
    "GLOWBOOSTER SUNSCREEN 60 ML\t193",
    "NIACINAMIDE 10% + PDRN\t21",
    "PDRN\t7",
    "Serum GB AHA BHA PHA\t6",
    "Serum GB Alpha Arbutin 2%\t176",
    "Serum GB Niacinamide 10%\t138",
    "Serum GB Retinol 1%\t8",
    "Serum GB Salicylic Acid 2%\t8",
    "Serum GB Vitamin C + Collagen\t37",
    "Serum Glow Booster\t64",
    "Total Keseluruhan\t2.976",
  ].join("\n");
  const r = rowsToInput(pasteToRows(teks));
  const H = hitung(master, r.out, r.total);
  assert.equal(H.total_input, 2976);
  assert.equal(H.total_file, 2976);
  assert.deepEqual(H.unknown, []);
  const acuan = {
    "Serum GB 7 Active Ingredients": 126, "Serum GB AHA BHA PHA": 6, "Serum GB Alpha Arbutin 2%": 2096,
    "Serum GB Niacinamide 10%": 2079, "Serum GB Salicylic Acid 2%": 8, "Serum GB Vitamin C + Collagen": 155,
    "Serum GB Retinol 1%": 27, "GB Sunscreen 30gr": 350, "GB Sunscreen 60gr": 193, "Serum GB PDRN": 28,
  };
  for (const [nama, n] of Object.entries(acuan)) assert.equal(pcs(H, nama), n, nama);
  assert.equal(H.total_pcs, 5068);
  assert.equal(H.total_nilai, 83_412_800);
});

test("rapikanTeksOcr: segitiga hijau Excel terbaca 'r' dibuang, huruf besar tunggal dipertahankan", () => {
  const r = rapikanTeksOcr([
    "GLOWBOOSTER SUNSCREEN 30 ML r 9",
    "Serum GB Vitamin C + Collagen r 4",
    "Serum GB Vitamin C + Collagen ' 4",
    "BUNDLING SERUM GB NIACINAMIDE + ALPHA ARBUTIN 51 r",
    "Serum Vitamin C 12",
    "[BUNDLING SERUM GLOW BOOSTER 2 PCS 1",
    "‘Serum GB Salicylic Acid 2% 3",
  ].join("\n"));
  assert.deepEqual(rowsToInput(pasteToRows(r.teks)).out, [
    { nama: "GLOWBOOSTER SUNSCREEN 30 ML", qty: 9 },
    { nama: "Serum GB Vitamin C + Collagen", qty: 4 },
    { nama: "Serum GB Vitamin C + Collagen", qty: 4 },
    { nama: "BUNDLING SERUM GB NIACINAMIDE + ALPHA ARBUTIN", qty: 51 },
    { nama: "Serum Vitamin C", qty: 12 },
    { nama: "BUNDLING SERUM GLOW BOOSTER 2 PCS", qty: 1 },
    { nama: "Serum GB Salicylic Acid 2%", qty: 3 },
  ]);
});

test("cocokAwalan: nama diawali nama produk/mapping dikenali otomatis", () => {
  assert.equal(cocokAwalan(master, "NEI Peeling Spray").dari, "NEI");
  assert.equal(cocokAwalan(master, "nei   peeling spray 100ml").dari, "NEI");
  assert.equal(cocokAwalan(master, "NEI Peeling Spray 100 ML").dari, "NEI");
  assert.equal(cocokAwalan(master, "GLOWBOOSTER SUNSCREEN 30 ML NEW").dari, "GLOWBOOSTER SUNSCREEN 30 ML");
  // nama terpanjang yang menang
  assert.equal(cocokAwalan(master, "KYURA BRIGHTENING DARK SPOT CREAM 15G").dari, "KYURA BRIGHTENING DARK SPOT CREAM");
  const r = resolve(master, "NEI Peeling Spray");
  assert.equal(r.cara, "otomatis");
  assert.deepEqual(r.komponen, [{ produk: "NEI", qty: 1 }]);
  assert.deepEqual(saran(master, "NEI Peeling Spray"), [{ produk: "NEI", qty: 1 }]);
});

test("cocokAwalan: TIDAK menebak bila sisa nama berisi produk/jumlah lain", () => {
  for (const n of [
    "Serum GB Niacinamide 10% + RETINOL",
    "KYURA ACNE CREAM 2 PCS",
    "NEI FREE POUCH",
    "NEI BONUS SERUM",
    "NEI & GLOSSMEN",
    "BUNDLING SERUM GB NIACINAMIDE + ALPHA ARBUTIN + RETINOL",
    "KYURA ACNE CREAM X2",
    "GLOWBOOSTER SUNSCREEN 30 ML 4", // angka lepas (sisa OCR / jumlah) -> jangan ditebak
    "NEI 2",
    "NEIXX",            // bukan awalan kata utuh
    "NEI",              // persis sama ditangani resolve biasa, bukan awalan
  ]) assert.equal(cocokAwalan(master, n), null, n);
});

test("hitung: nama otomatis ikut dihitung, bukan 'belum dikenal'", () => {
  const H = hitung(master, [{ nama: "NEI Peeling Spray", qty: 5 }, { nama: "NEI FREE POUCH", qty: 2 }], null);
  assert.equal(pcs(H, "NEI"), 5);
  assert.deepEqual(H.unknown, [{ nama: "NEI FREE POUCH", qty: 2 }]);
  assert.equal(H.total_nilai, 5 * 15600);
});

test("angkaOcr: token angka OCR", () => {
  assert.equal(angkaOcr("1.198"), 1198);
  assert.equal(angkaOcr("4l"), 41);
  assert.equal(angkaOcr("1O"), 10);
  assert.equal(angkaOcr("ML"), null);
  assert.equal(angkaOcr("2%"), null);
});

test("selaraskanDenganTotal: pilih bacaan yang jumlahnya cocok dengan Total (kasus 41 terbaca 11)", () => {
  // 7 + 816 + 41 = 864; bacaan utama salah 41 -> 11, bacaan khusus angka benar 41
  assert.deepEqual(selaraskanDenganTotal([[7], [816], [11, 41]], [864]), { qty: [7, 816, 41], total: 864 });
  // kebalikannya: bacaan khusus angka yang salah
  assert.deepEqual(selaraskanDenganTotal([[7], [816], [41, 11]], [864]), { qty: [7, 816, 41], total: 864 });
  // baris Total sendiri yang salah baca
  assert.deepEqual(selaraskanDenganTotal([[7], [816], [41]], [834, 864]), { qty: [7, 816, 41], total: 864 });
  // tidak ada kombinasi yang cocok -> null (dilaporkan sebagai angka ragu)
  assert.equal(selaraskanDenganTotal([[7], [11, 17]], [100]), null);
  // semua sepakat & cocok
  assert.deepEqual(selaraskanDenganTotal([[1], [2]], [3]), { qty: [1, 2], total: 3 });
});

test("rekapRiwayat: gabungkan beberapa entri per produk + rincian per entri", () => {
  const e = (id, judul, input) => ({ ...hitung(master, input, null), id, judul, dibuat: "2026-10-26 10:00:00", oleh: "Tes" });
  const R = rekapRiwayat([
    e("a", "CV A", [{ nama: "PDRN", qty: 7 }, { nama: "BUNDLING SERUM GB NIACINAMIDE + ALPHA ARBUTIN", qty: 10 }]),
    e("b", "PT B", [{ nama: "PDRN", qty: 3 }, { nama: "REMOLE", qty: 2 }]),
  ]);
  const p = (n) => R.produk.find((x) => x.nama === n);
  assert.equal(p("Serum GB PDRN").pcs, 10);
  assert.deepEqual(p("Serum GB PDRN").per, { a: { pcs: 7, nilai: 7 * 16650 }, b: { pcs: 3, nilai: 3 * 16650 } });
  assert.equal(p("Serum GB Niacinamide 10%").pcs, 10);
  assert.equal(p("REMOLE").nilai, 0); // tanpa harga tetap ikut, nilai 0
  assert.equal(R.produk.length, 4);   // hanya produk yang ada pcs-nya
  assert.equal(R.total_pcs, 10 + 10 + 10 + 2);
  assert.equal(R.total_nilai, 10 * 16650 + 10 * 15100 + 10 * 16200);
  assert.deepEqual(R.entri.map((x) => x.judul), ["CV A", "PT B"]);
});

test("sidikInput & cariDobel: input dobel ketahuan walau urutan/huruf beda", () => {
  const a = sidikInput([{ nama: "PDRN", qty: 28 }, { nama: "GLOWBOOSTER SUNSCREEN 30 ML", qty: 350 }]);
  assert.equal(sidikInput([{ nama: "glowbooster  sunscreen 30 ml", qty: 350 }, { nama: "pdrn", qty: 28 }]), a);
  assert.equal(sidikInput([{ nama: "PDRN", qty: 20 }, { nama: "PDRN", qty: 8 }, { nama: "GLOWBOOSTER SUNSCREEN 30 ML", qty: 350 }]), a);
  assert.notEqual(sidikInput([{ nama: "PDRN", qty: 29 }, { nama: "GLOWBOOSTER SUNSCREEN 30 ML", qty: 350 }]), a);

  const r = (id, sidik, total_pcs, total_nilai) => ({ id, judul: id, dibuat: "", oleh: "", total_pcs, total_nilai, sidik });
  const list = [r("sendiri", a, 378, 1000), r("x", a, 378, 1000), r("lama", undefined, 378, 1000), r("lain", "beda", 5, 1000)];
  const D = cariDobel({ sidik: a, total_pcs: 378, total_nilai: 1000 }, list, ["sendiri", null]);
  assert.deepEqual(D.sama.map((x) => x.id), ["x"]);
  assert.deepEqual(D.mirip.map((x) => x.id), ["lama"]);
  // data kosong (0 pcs) tidak dianggap mirip
  assert.equal(cariDobel({ sidik: "z", total_pcs: 0, total_nilai: 0 }, [r("n", "y", 0, 0)]).mirip.length, 0);
});

test("saran: SERUM vs CREAM pada nama yang sama tidak tertukar (kasus Dark Spot Serum terpetakan ke Cream)", () => {
  assert.deepEqual(saran(master, "BUNDLING KY BRIGHTENING DARK SPOT SERUM 2 PCS"), [{ produk: "KYURA BRIGHTENING DARK SPOT SERUM", qty: 2 }]);
  assert.deepEqual(saran(master, "BUNDLING KY BRIGHTENING DARK SPOT CREAM 3 PCS"), [{ produk: "KYURA BRIGHTENING DARK SPOT CREAM", qty: 3 }]);
  assert.deepEqual(saran(master, "KYURA ACNE SERUM 2 PCS"), [{ produk: "KYURA ACNE SERUM", qty: 2 }]);
});

test("saran: bagian setelah '+' yang hanya berisi jenis produk memakai konteks bagian sebelumnya", () => {
  assert.deepEqual(saran(master, "BUNDLING BRIGHTENING DARK SPOT CREAM + SERUM"), [
    { produk: "KYURA BRIGHTENING DARK SPOT CREAM", qty: 1 },
    { produk: "KYURA BRIGHTENING DARK SPOT SERUM", qty: 1 },
  ]);
  assert.deepEqual(saran(master, "BUNDLING BARRIER SERUM + BARRIER CREAM"), [
    { produk: "KYURA BARRIER SERUM", qty: 1 },
    { produk: "KYURA BARRIER CREAM", qty: 1 },
  ]);
  // perilaku lama tetap: bundling GB dipecah sesuai nama bahannya
  assert.deepEqual(saran(master, "BUNDLING SERUM GB NIACINAMIDE + ALPHA ARBUTIN").map((k) => k.produk), ["Serum GB Niacinamide 10%", "Serum GB Alpha Arbutin 2%"]);
});
