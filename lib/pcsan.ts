// Logika inti PCSAN — murni (tanpa UI / tanpa database), dipakai di browser & server.

export type Produk = { nama: string; grup: string; harga: number | null };
export type Komponen = { produk: string; qty: number };
export type Mapping = { nama: string; komponen: Komponen[] };
export type Master = { versi: number; produk: Produk[]; mapping: Mapping[]; diubah?: string; oleh?: string };
export type InputRow = { nama: string; qty: number };
export type Asal = { nama: string; qty: number; x: number; pcs: number };
export type BarisHasil = { nama: string; grup: string; harga: number | null; pcs: number; nilai: number; asal: Asal[] };
export type Resolusi = { cara: "mapping" | "langsung"; komponen: Komponen[] } | null;
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

/** Angka hasil OCR yang tertukar dengan huruf mirip: O/o→0, l/I→1 (hanya di token terakhir yang memang berisi angka). */
const OCR_ANGKA: Record<string, string> = { O: "0", o: "0", l: "1", I: "1" };

/**
 * Teks hasil OCR screenshot -> teks "Nama<TAB>qty" per baris (siap untuk pasteToRows).
 * Baris yang tidak berakhiran angka tetap ditulis apa adanya (tidak dihitung) dan dilaporkan di `tanpaAngka`
 * supaya pengguna bisa mengecek apakah ada baris yang salah baca.
 */
export function rapikanTeksOcr(text: string): { teks: string; tanpaAngka: string[] } {
  const keluar: string[] = [];
  const tanpaAngka: string[] = [];
  for (const raw of text.split(/\r?\n/)) {
    const l = raw.replace(/[|‖¦]+\s*$/, "").replace(/^\s*[|‖¦]+/, "").replace(/\s+/g, " ").trim();
    if (!l) continue;
    const m = l.match(/^(.*?)[\s|:;_—–]+([0-9OolI.,]*\d[0-9OolI.,]*)$/);
    if (m && /[A-Za-z]/.test(m[1])) {
      const qty = m[2].replace(/[OolI]/g, (c) => OCR_ANGKA[c]);
      keluar.push(`${m[1].replace(/[\s.:_—–-]+$/, "")}\t${qty}`);
    } else {
      keluar.push(l);
      if (/[A-Za-z]{3}/.test(l)) tanpaAngka.push(l);
    }
  }
  return { teks: keluar.join("\n"), tanpaAngka };
}

export function resolve(master: Master, nama: string): Resolusi {
  const k = norm(nama);
  const m = master.mapping.find((x) => norm(x.nama) === k);
  if (m) return { cara: "mapping", komponen: m.komponen };
  const p = master.produk.find((x) => norm(x.nama) === k);
  if (p) return { cara: "langsung", komponen: [{ produk: p.nama, qty: 1 }] };
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
