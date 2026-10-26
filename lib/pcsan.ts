// Logika inti PCSAN — murni (tanpa UI / tanpa database), dipakai di browser & server.

export type Produk = { nama: string; grup: string; harga: number | null };
export type Komponen = { produk: string; qty: number };
export type Mapping = { nama: string; komponen: Komponen[] };
export type Master = { versi: number; produk: Produk[]; mapping: Mapping[]; diubah?: string; oleh?: string };
export type InputRow = { nama: string; qty: number };
export type Asal = { nama: string; qty: number; x: number; pcs: number };
export type BarisHasil = { nama: string; grup: string; harga: number | null; pcs: number; nilai: number; asal: Asal[] };
/** cara "otomatis" = dikenali dari awalan nama (lihat cocokAwalan); `dari` = nama produk/mapping yang cocok */
export type Resolusi = { cara: "mapping" | "langsung" | "otomatis"; komponen: Komponen[]; dari?: string } | null;
export type Hasil = {
  judul: string;
  sumber: string;
  input: InputRow[];
  total_file: number | null;
  baris: BarisHasil[];
  unknown: InputRow[];
  badKomp: string[];
  total_input: number;
  total_pcs: number;
  total_nilai: number;
};

export const norm = (s: unknown) => String(s ?? "").toUpperCase().replace(/\s+/g, " ").trim();

/** "1.821" / "1,821" / 1821 / "-" -> angka */
export function parseQty(v: unknown): number | null {
  if (v == null) return null;
  if (typeof v === "number") return v;
  let s = String(v).trim();
  if (s === "" || s === "-") return 0;
  s = s.replace(/\s/g, "").replace(/[.,](?=\d{3}(\D|$))/g, "");
  s = s.replace(",", ".");
  const n = Number(s);
  return isNaN(n) ? null : n;
}

/** Harga: "Rp 25.000" / "15.100,-" / 25000 -> angka. Kosong / "-" -> null (belum ada harga). Tidak terbaca -> undefined. */
export function parseHarga(v: unknown): number | null | undefined {
  if (v == null) return null;
  if (typeof v === "number") return isFinite(v) && v >= 0 ? v : undefined;
  const s = String(v).trim().replace(/^rp\.?/i, "").replace(/[.,]-$/, "").trim();
  if (s === "" || s === "-") return null;
  const n = parseQty(s);
  return n == null || n < 0 ? undefined : n;
}

const isNamaHeader = (t: string) =>
  t === "NAMA" || t.startsWith("NAMA") || t.startsWith("ROW LABELS") || t === "LABEL BARIS";
const isQtyHeader = (t: string) =>
  t === "QTY" || t.startsWith("QTY") || t.startsWith("SUM OF QTY") || t.startsWith("JUMLAH") || t.startsWith("KUANTITAS");

/** Baca baris Excel / paste dengan format Nama | qty. Baris "Total ..." dipakai sebagai cek. */
export function rowsToInput(rows: unknown[][]): { out: InputRow[]; total: number | null } {
  let hi = -1, ci = 0, cq = 1;
  for (let i = 0; i < Math.min(rows.length, 30); i++) {
    const r = rows[i] || [];
    let a = -1, b = -1;
    r.forEach((c, j) => {
      const t = norm(c);
      if (a < 0 && isNamaHeader(t)) a = j;
      if (b < 0 && isQtyHeader(t)) b = j;
    });
    if (a >= 0 && b >= 0) { hi = i; ci = a; cq = b; break; }
  }
  const out: InputRow[] = [];
  let total: number | null = null;
  for (let i = hi + 1; i < rows.length; i++) {
    const r = rows[i] || [];
    const nama = String(r[ci] ?? "").trim();
    const q = parseQty(r[cq]);
    if (!nama) continue;
    const nn = norm(nama);
    if (nn.startsWith("TOTAL") || nn === "GRAND TOTAL") { if (q != null) total = q; continue; }
    if (nn === "(BLANK)" || nn === "(KOSONG)") continue;
    if (q == null) continue;
    out.push({ nama, qty: q });
  }
  return { out, total };
}

/** Teks hasil copy dari Excel (dipisah TAB) -> baris */
export function pasteToRows(text: string): unknown[][] {
  return text.split(/\r?\n/).map((l) => {
    let p = l.split("\t");
    if (p.length < 2) {
      const m = l.match(/^(.*?)[\s;]+([\d.,-]+)\s*$/);
      p = m ? [m[1], m[2]] : [l];
    }
    return [p[0], p[p.length - 1]];
  });
}

/**
 * Buang "sampah" OCR di ujung teks: 1 huruf kecil atau token berisi simbol saja (mis. segitiga hijau Excel
 * terbaca "r", atau ' » ~). Huruf besar tunggal dipertahankan karena bisa bagian nama (mis. "Vitamin C").
 */
const buangSampahOcr = (s: string) => {
  let t = s, sebelum;
  do { sebelum = t; t = t.replace(/\s+(?:[a-z]|[^\p{L}\p{N}%+()\s]+)$/u, ""); } while (t !== sebelum);
  return t;
};

/** Angka hasil OCR yang tertukar dengan huruf mirip: O/o→0, l/I→1 (hanya di token terakhir yang memang berisi angka). */
const OCR_ANGKA: Record<string, string> = { O: "0", o: "0", l: "1", I: "1" };

/** Token angka hasil OCR -> angka (O/o→0, l/I→1). null bila tidak ada digit / tidak terbaca. */
export function angkaOcr(s: string): number | null {
  const t = s.trim();
  if (!/\d/.test(t) || !/^[0-9OolI.,]+$/.test(t)) return null;
  return parseQty(t.replace(/[OolI]/g, (c) => OCR_ANGKA[c]));
}

/**
 * Qty tiap baris dibaca dua kali oleh OCR (bacaan utama & bacaan khusus angka). Bila ada yang berbeda, pilih kombinasi
 * yang jumlahnya sama dengan baris Total. kandidat[i] = 1 atau 2 nilai untuk baris i (indeks 1 = bacaan khusus angka,
 * diutamakan bila beberapa kombinasi sama-sama cocok); total = kandidat nilai baris Total.
 * Hasil: qty terpilih per baris + total, atau null bila tidak ada kombinasi yang cocok.
 */
export function selaraskanDenganTotal(kandidat: number[][], total: number[]): { qty: number[]; total: number } | null {
  const ragu = kandidat.flatMap((k, i) => (k.length > 1 ? [i] : []));
  if (ragu.length > 12) return null;
  const tetap = kandidat.reduce((a, k) => a + (k.length > 1 ? 0 : k[0]), 0);
  let best: { mask: number; total: number; skor: number } | null = null;
  for (let mask = 0; mask < 1 << ragu.length; mask++) {
    let s = tetap, skor = 0;
    ragu.forEach((i, b) => { const p = (mask >> b) & 1; s += kandidat[i][p]; skor += p; });
    for (const t of total) if (s === t && (!best || skor > best.skor)) best = { mask, total: t, skor };
  }
  if (!best) return null;
  const { mask } = best;
  return { qty: kandidat.map((k, i) => (k.length > 1 ? k[(mask >> ragu.indexOf(i)) & 1] : k[0])), total: best.total };
}

/**
 * Teks hasil OCR screenshot -> teks "Nama<TAB>qty" per baris (siap untuk pasteToRows).
 * Baris yang tidak berakhiran angka tetap ditulis apa adanya (tidak dihitung) dan dilaporkan di `tanpaAngka`
 * supaya pengguna bisa mengecek apakah ada baris yang salah baca.
 */
export function rapikanTeksOcr(text: string): { teks: string; tanpaAngka: string[] } {
  const keluar: string[] = [];
  const tanpaAngka: string[] = [];
  for (const raw of text.split(/\r?\n/)) {
    // simbol nyasar di awal baris (garis tabel, "[", "‘") dibuang; nama barang selalu diawali huruf/angka
    const l = buangSampahOcr(raw.replace(/[|‖¦]+\s*$/, "").replace(/^[^\p{L}\p{N}]+/u, "").replace(/\s+/g, " ").trim());
    if (!l) continue;
    const m = l.match(/^(.*?)[\s|:;_—–]+([0-9OolI.,]*\d[0-9OolI.,]*)$/);
    if (m && /[A-Za-z]/.test(m[1])) {
      const qty = m[2].replace(/[OolI]/g, (c) => OCR_ANGKA[c]);
      keluar.push(`${buangSampahOcr(m[1]).replace(/[\s.:_—–-]+$/, "")}\t${qty}`);
    } else {
      keluar.push(l);
      if (/[A-Za-z]{3}/.test(l)) tanpaAngka.push(l);
    }
  }
  return { teks: keluar.join("\n"), tanpaAngka };
}

// Tanda bahwa sisa nama bisa berisi produk lain / jumlah lain -> jangan dikenali otomatis, harus dipetakan manual.
const PENANDA_PAKET =
  /[+&\/,]|\b(DAN|WITH|FREE|GRATIS|BONUS|HADIAH|PAKET|BUNDLING|BUNDLE|KIT|SET|BELI|ISI|COMBO|DUO|TRIO)\b|\d+\s*(PCS|PC|X|PACK|PAK|BOX|BTL|BOTOL)\b|\bX\s*\d/;

// Angka lepas tanpa satuan (mis. "... 30 ML 4") bisa berarti jumlah/varian atau sisa salah baca OCR -> jangan ditebak.
// Ukuran seperti "100ML", "100 ML", "15G", "2%" tetap boleh.
const ANGKA_TANPA_SATUAN = /(^|\s)\d+([.,]\d+)?(?!\s*(ML|GR|GRAM|G|KG|L|LT|LTR|MG|CM|MM|%)\b)(?=\s|$)/;

/**
 * Kenali nama barang yang DIAWALI nama produk / mapping yang sudah ada, mis. "NEI Peeling Spray" -> NEI
 * (atas permintaan pengguna, 2026-10-26). Hanya bila sisa namanya tidak mengandung PENANDA_PAKET, supaya
 * "Serum GB Niacinamide 10% + RETINOL" atau "KYURA ACNE CREAM 2 PCS" tidak salah dihitung. Bila ada beberapa
 * yang cocok, dipilih nama terpanjang.
 */
export function cocokAwalan(master: Master, nama: string): { dari: string; komponen: Komponen[] } | null {
  const n = norm(nama);
  const kandidat = [
    ...master.mapping.map((m) => ({ nama: m.nama, komponen: m.komponen })),
    ...master.produk.map((p) => ({ nama: p.nama, komponen: [{ produk: p.nama, qty: 1 }] })),
  ];
  let best: (typeof kandidat)[number] | null = null;
  for (const c of kandidat) {
    const k = norm(c.nama);
    if (k.length < 3 || !n.startsWith(k + " ")) continue;
    const sisa = n.slice(k.length);
    if (PENANDA_PAKET.test(sisa) || ANGKA_TANPA_SATUAN.test(sisa)) continue;
    if (!best || k.length > norm(best.nama).length) best = c;
  }
  return best ? { dari: best.nama, komponen: best.komponen } : null;
}

export function resolve(master: Master, nama: string): Resolusi {
  const k = norm(nama);
  const m = master.mapping.find((x) => norm(x.nama) === k);
  if (m) return { cara: "mapping", komponen: m.komponen };
  const p = master.produk.find((x) => norm(x.nama) === k);
  if (p) return { cara: "langsung", komponen: [{ produk: p.nama, qty: 1 }] };
  const a = cocokAwalan(master, nama);
  if (a) return { cara: "otomatis", komponen: a.komponen, dari: a.dari };
  return null;
}

/** Aturan: setiap komponen mendapat qty nama barang × jumlah pcs komponen. */
export function hitung(master: Master, input: InputRow[], totalFile: number | null, judul = "", sumber = ""): Hasil {
  const pm = new Map(master.produk.map((p) => [norm(p.nama), p]));
  const per = new Map<string, { pcs: number; asal: Asal[] }>();
  const unknown: InputRow[] = [];
  const badKomp: string[] = [];
  let totalInput = 0;
  for (const r of input) {
    totalInput += r.qty;
    const res = resolve(master, r.nama);
    if (!res) { unknown.push(r); continue; }
    for (const k of res.komponen) {
      const kp = norm(k.produk);
      if (!pm.has(kp)) { badKomp.push(`${r.nama} → ${k.produk}`); continue; }
      const x = Number(k.qty || 0);
      const pcs = r.qty * x;
      if (!per.has(kp)) per.set(kp, { pcs: 0, asal: [] });
      const o = per.get(kp)!;
      o.pcs += pcs;
      o.asal.push({ nama: r.nama, qty: r.qty, x, pcs });
    }
  }
  const baris: BarisHasil[] = master.produk.map((p) => {
    const o = per.get(norm(p.nama)) || { pcs: 0, asal: [] };
    const harga = p.harga === null || p.harga === undefined || (p.harga as any) === "" ? null : Number(p.harga);
    return { nama: p.nama, grup: p.grup || "", harga, pcs: o.pcs, asal: o.asal, nilai: harga == null ? 0 : o.pcs * harga };
  });
  return {
    judul, sumber, input, total_file: totalFile, baris, unknown, badKomp,
    total_input: totalInput,
    total_pcs: baris.reduce((a, b) => a + b.pcs, 0),
    total_nilai: baris.reduce((a, b) => a + b.nilai, 0),
  };
}

// --- saran mapping otomatis untuk nama barang baru: pecah di "+", cocokkan kata, "N PCS" = kali N
const STOP = new Set(["BUNDLING", "PAKET", "SERUM", "GB", "GLOW", "BOOSTER", "GLOWBOOSTER", "PCS", "PC", "DAN", "&", "+", "ISI"]);
const toks = (s: string) => norm(s).replace(/[^A-Z0-9%+ ]/g, " ").split(/\s+/).filter(Boolean);

export function saran(master: Master, nama: string): Komponen[] {
  const a = cocokAwalan(master, nama);
  if (a) return a.komponen.map((k) => ({ ...k }));
  let n = norm(nama);
  let mult = 1;
  const mm = n.match(/(\d+)\s*PCS/);
  if (mm) { mult = +mm[1]; n = n.replace(mm[0], " "); }
  const res: Komponen[] = [];
  for (const part of n.split("+").map((s) => s.trim()).filter(Boolean)) {
    const pt = toks(part).filter((t) => !STOP.has(t));
    let best: Produk | null = null, bs = 0;
    for (const p of master.produk) {
      const tt = new Set(toks(p.nama));
      let s = 0;
      pt.forEach((x) => {
        if (tt.has(x)) s += 2;
        else if ([...tt].some((y) => y.startsWith(x) || x.startsWith(y))) s += 1;
      });
      if (norm(p.nama) === norm(part)) s += 100;
      if (s > bs) { bs = s; best = p; }
    }
    if (best && !res.some((r) => r.produk === best!.nama)) res.push({ produk: best.nama, qty: mult });
  }
  return res.length ? res : [{ produk: "", qty: 1 }];
}

export const fmt = (n: number | null | undefined) =>
  n == null || (n as any) === "" ? "" : Number(n).toLocaleString("id-ID");

// --- rekap beberapa entri Riwayat sekaligus (memakai hasil persis seperti saat disimpan)
export type EntriRiwayat = Pick<Hasil, "baris" | "total_pcs" | "total_nilai"> & { id: string; judul: string; dibuat: string; oleh: string };
export type RekapProduk = { nama: string; grup: string; pcs: number; nilai: number; per: Record<string, { pcs: number; nilai: number }> };
export type Rekap = {
  entri: { id: string; judul: string; dibuat: string; oleh: string; total_pcs: number; total_nilai: number }[];
  produk: RekapProduk[];
  total_pcs: number;
  total_nilai: number;
};

/** Gabungkan hasil beberapa entri Riwayat: total pcs & nilai per produk, plus rinciannya per entri. Produk tanpa pcs dilewati. */
export function rekapRiwayat(list: EntriRiwayat[]): Rekap {
  const per = new Map<string, RekapProduk>();
  for (const e of list) {
    for (const b of e.baris || []) {
      if (!b.pcs) continue;
      const k = norm(b.nama);
      if (!per.has(k)) per.set(k, { nama: b.nama, grup: b.grup || "", pcs: 0, nilai: 0, per: {} });
      const p = per.get(k)!;
      p.pcs += b.pcs;
      p.nilai += b.nilai || 0;
      const x = (p.per[e.id] ||= { pcs: 0, nilai: 0 });
      x.pcs += b.pcs;
      x.nilai += b.nilai || 0;
    }
  }
  // kelompokkan per grup (urutan grup = urutan pertama muncul), urutan produk dalam grup tetap
  const urutGrup = [...new Set([...per.values()].map((p) => p.grup))];
  const produk = [...per.values()].sort((a, b) => urutGrup.indexOf(a.grup) - urutGrup.indexOf(b.grup));
  return {
    entri: list.map((e) => ({ id: e.id, judul: e.judul, dibuat: e.dibuat, oleh: e.oleh, total_pcs: e.total_pcs, total_nilai: e.total_nilai })),
    produk,
    total_pcs: produk.reduce((a, p) => a + p.pcs, 0),
    total_nilai: produk.reduce((a, p) => a + p.nilai, 0),
  };
}

// --- cek input dobel (data yang sama diinput 2× membuat rekap dobel tanpa ketahuan)
/** Sidik isi input: tidak terpengaruh urutan baris, huruf besar/kecil, spasi, atau nama yang sama dipecah 2 baris. */
export function sidikInput(input: InputRow[]): string {
  const per = new Map<string, number>();
  for (const r of input || []) per.set(norm(r.nama), (per.get(norm(r.nama)) || 0) + (Number(r.qty) || 0));
  const s = [...per].filter(([, q]) => q).sort(([a], [b]) => (a < b ? -1 : a > b ? 1 : 0)).map(([n, q]) => n + "=" + q).join("\n");
  // FNV-1a 32-bit, cukup untuk membedakan data; panjang dipakai sebagai pembeda tambahan
  let h = 0x811c9dc5;
  for (let i = 0; i < s.length; i++) h = Math.imul(h ^ s.charCodeAt(i), 0x01000193);
  return (h >>> 0).toString(16).padStart(8, "0") + "-" + per.size;
}

export type RingkasDobel = { id: string; judul: string; dibuat: string; oleh: string; total_pcs: number; total_nilai: number; sidik?: string };
/**
 * Cari riwayat lain yang kemungkinan data yang sama.
 * sama  = isi Nama|qty persis sama (sidik sama).
 * mirip = isi berbeda/tak diketahui (riwayat lama tanpa sidik, atau OCR beda baca) tapi total pcs DAN total nilai sama persis.
 */
export function cariDobel(
  cur: { sidik: string; total_pcs: number; total_nilai: number },
  list: RingkasDobel[],
  kecuali: (string | null | undefined)[] = [],
): { sama: RingkasDobel[]; mirip: RingkasDobel[] } {
  const sama: RingkasDobel[] = [], mirip: RingkasDobel[] = [];
  for (const x of list || []) {
    if (kecuali.includes(x.id)) continue;
    if (x.sidik && x.sidik === cur.sidik) sama.push(x);
    else if (cur.total_pcs > 0 && x.total_pcs === cur.total_pcs && x.total_nilai === cur.total_nilai) mirip.push(x);
  }
  return { sama, mirip };
}
