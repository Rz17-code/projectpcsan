// Tes logika inti PCSAN (lib/pcsan.ts) memakai master awal di data-awal/master.json.
// Jalankan: npm test
import { test } from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { hitung, parseHarga, parseQty, pasteToRows, resolve, rowsToInput } from "../lib/pcsan.ts";

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
