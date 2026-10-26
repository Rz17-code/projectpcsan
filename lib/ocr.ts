// Baca teks dari screenshot di browser (Tesseract.js, gratis, tanpa akun).
// Mesin OCR & data bahasa diunduh dari CDN saat pertama dipakai (butuh internet), lalu di-cache browser.
import { angkaOcr, fmt, norm, selaraskanDenganTotal } from "./pcsan";

// bingkai putih di sekeliling gambar: huruf yang menempel di tepi gambar sering salah baca (mis. "Serum" -> "son")
const BINGKAI = 30;

/** Skala supaya lebar gambar ±1600px (maks 3×) — huruf kecil lebih mudah terbaca OCR. */
const skalaUtama = (lebar: number) => (lebar < 1600 ? Math.min(3, 1600 / lebar) : 1);

/**
 * Perbesar gambar, beri bingkai putih & ubah ke abu-abu. `ambang` (0..255) = jadikan hitam-putih tegas;
 * dipakai untuk versi kedua gambar saat membaca ulang angka, supaya bacaan ulang tidak mengulang kesalahan yang sama.
 */
function siapkanGambar(bmp: ImageBitmap, skala: number, ambang?: number): HTMLCanvasElement {
  const c = document.createElement("canvas");
  c.width = Math.round(bmp.width * skala) + 2 * BINGKAI;
  c.height = Math.round(bmp.height * skala) + 2 * BINGKAI;
  const g = c.getContext("2d")!;
  g.fillStyle = "#fff";
  g.fillRect(0, 0, c.width, c.height);
  g.imageSmoothingQuality = "high";
  g.drawImage(bmp, BINGKAI, BINGKAI, c.width - 2 * BINGKAI, c.height - 2 * BINGKAI);
  const img = g.getImageData(0, 0, c.width, c.height);
  const d = img.data;
  for (let i = 0; i < d.length; i += 4) {
    const [r, g, b] = [d[i], d[i + 1], d[i + 2]];
    const luma = 0.299 * r + 0.587 * g + 0.114 * b;
    // segitiga hijau Excel (tanda "angka disimpan sebagai teks") -> putih, supaya tidak terbaca sebagai huruf/angka;
    // termasuk pinggirannya yang pudar (hijau muda & terang) agar tidak tersisa garis tipis
    const hijau = (g > r + 40 && g > b + 40) || (g > r + 6 && g > b + 6 && luma > 150);
    const y = hijau ? 255 : luma;
    d[i] = d[i + 1] = d[i + 2] = ambang == null ? y : y < ambang ? 0 : 255;
  }
  g.putImageData(img, 0, 0);
  return c;
}

/** Potong satu kotak dari gambar ke kanvas baru berbingkai putih (untuk membaca ulang satu sel). */
function potong(src: HTMLCanvasElement, x: number, y: number, w: number, h: number): HTMLCanvasElement {
  const c = document.createElement("canvas");
  c.width = Math.round(w) + 2 * BINGKAI;
  c.height = Math.round(h) + 2 * BINGKAI;
  const g = c.getContext("2d")!;
  g.fillStyle = "#fff";
  g.fillRect(0, 0, c.width, c.height);
  g.drawImage(src, x, y, w, h, BINGKAI, BINGKAI, w, h);
  return c;
}

export type HasilOcr = {
  teks: string;
  /** baris yang qty-nya terbaca berbeda di dua bacaan dan tidak bisa dipastikan lewat Total, mis. "SUNSCREEN 60 ML: 11 atau 41" */
  ragu: string[];
};

/**
 * Baca screenshot tabel Nama | qty. Kolom qty dibaca dua kali: bacaan utama + bacaan ulang per sel yang hanya boleh angka.
 * Bila keduanya berbeda, dipilih kombinasi yang jumlahnya cocok dengan baris Total; sisanya dilaporkan di `ragu`.
 * onProgress menerima 0..1.
 */
export async function bacaScreenshot(file: Blob, onProgress: (p: number) => void): Promise<HasilOcr> {
  const T = await import("tesseract.js");
  let tahapUtama = true;
  const worker = await T.createWorker("eng", T.OEM.LSTM_ONLY, {
    logger: (m) => { if (tahapUtama && m.status === "recognizing text") onProgress(m.progress * 0.8); },
  });
  try {
    const bmp = await createImageBitmap(file);
    const skala = skalaUtama(bmp.width);
    const kanvas = siapkanGambar(bmp, skala);
    // SINGLE_BLOCK cocok untuk tabel 2 kolom; spasi antar-kata dipertahankan supaya kolom qty tetap terpisah
    await worker.setParameters({ tessedit_pageseg_mode: T.PSM.SINGLE_BLOCK, preserve_interword_spaces: "1" });
    const { data } = await worker.recognize(kanvas, {}, { text: true, blocks: true });
    tahapUtama = false;
    const lines = (data.blocks || []).flatMap((b) => b.paragraphs.flatMap((p) => p.lines));

    // kata terakhir tiap baris yang berisi angka & ada di sisi kanan gambar = sel qty
    const sel = lines.map((l) => {
      const w = l.words[l.words.length - 1];
      return w && angkaOcr(w.text) != null && w.bbox.x1 > kanvas.width * 0.5 ? w : null;
    });
    const ada = sel.filter((w) => w != null);
    if (!ada.length) return { teks: data.text, ragu: [] };
    const kiri = Math.max(0, Math.min(...ada.map((w) => w.bbox.x0)) - 12);
    const kanan = Math.min(kanvas.width, Math.max(...ada.map((w) => w.bbox.x1)) + 12);

    // baca ulang tiap sel qty, hanya angka, dari versi gambar KEDUA (lebih besar & hitam-putih tegas) supaya
    // menjadi pembanding yang independen dari bacaan utama
    const k2 = 1.6;
    const kanvas2 = siapkanGambar(bmp, skala * k2, 165);
    const ke2 = (v: number) => (v - BINGKAI) * k2 + BINGKAI; // koordinat gambar utama -> gambar kedua
    await worker.setParameters({ tessedit_pageseg_mode: T.PSM.SINGLE_LINE, tessedit_char_whitelist: "0123456789.," });
    const ulang: (number | null)[] = [];
    for (let i = 0; i < lines.length; i++) {
      const w = sel[i];
      if (!w) { ulang.push(null); continue; }
      const y0 = Math.max(0, Math.min(lines[i].bbox.y0, w.bbox.y0) - 6);
      const y1 = Math.min(kanvas.height, Math.max(lines[i].bbox.y1, w.bbox.y1) + 6);
      const r = await worker.recognize(potong(kanvas2, ke2(kiri), ke2(y0), (kanan - kiri) * k2, (y1 - y0) * k2));
      ulang.push(angkaOcr(r.data.text.replace(/\s/g, "")));
      onProgress(0.8 + (0.2 * (i + 1)) / lines.length);
    }

    // kandidat qty per baris; baris Total dipisah sebagai pembanding
    const isTotal = (i: number) => /^(GRAND )?TOTAL/.test(norm(lines[i].text.replace(/^[^\p{L}]+/u, "")));
    const kand = lines.map((_, i) => {
      if (!sel[i]) return null;
      const k = [angkaOcr(sel[i]!.text)!];
      const u = ulang[i];
      if (u != null && u !== k[0]) k.push(u);
      return k;
    });
    const iTotal = lines.findIndex((_, i) => kand[i] && isTotal(i));
    const iBaris = lines.map((_, i) => i).filter((i) => kand[i] && i !== iTotal);
    const cocok = iTotal >= 0 ? selaraskanDenganTotal(iBaris.map((i) => kand[i]!), kand[iTotal]!) : null;

    const pilih = new Map<number, number>();
    const ragu: string[] = [];
    if (cocok) {
      iBaris.forEach((i, j) => pilih.set(i, cocok.qty[j]));
      pilih.set(iTotal, cocok.total);
    } else {
      for (const i of [...iBaris, ...(iTotal >= 0 ? [iTotal] : [])]) {
        const k = kand[i]!;
        pilih.set(i, k[0]);
        if (k.length > 1) ragu.push(`${lines[i].text.slice(0, lines[i].text.lastIndexOf(sel[i]!.text)).trim()}: ${fmt(k[0])} atau ${fmt(k[1])}`);
      }
    }

    const teks = lines
      .map((l, i) => {
        const t = l.text.replace(/\s+$/, "");
        const w = sel[i];
        if (!w || !pilih.has(i)) return t;
        const pos = t.lastIndexOf(w.text);
        return pos < 0 ? t : t.slice(0, pos) + fmt(pilih.get(i)!) + t.slice(pos + w.text.length);
      })
      .join("\n");
    return { teks, ragu };
  } finally {
    await worker.terminate();
  }
}
