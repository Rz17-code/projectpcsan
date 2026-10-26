// Baca teks dari screenshot di browser (Tesseract.js, gratis, tanpa akun).
// Mesin OCR & data bahasa diunduh dari CDN saat pertama dipakai (butuh internet), lalu di-cache browser.

/** Perbesar gambar kecil & ubah ke abu-abu supaya angka lebih mudah terbaca OCR. */
async function siapkanGambar(file: Blob): Promise<HTMLCanvasElement> {
  const bmp = await createImageBitmap(file);
  const skala = bmp.width < 1600 ? Math.min(3, 1600 / bmp.width) : 1;
  const c = document.createElement("canvas");
  c.width = Math.round(bmp.width * skala);
  c.height = Math.round(bmp.height * skala);
  const g = c.getContext("2d")!;
  g.imageSmoothingQuality = "high";
  g.drawImage(bmp, 0, 0, c.width, c.height);
  const img = g.getImageData(0, 0, c.width, c.height);
  const d = img.data;
  for (let i = 0; i < d.length; i += 4) {
    const y = 0.299 * d[i] + 0.587 * d[i + 1] + 0.114 * d[i + 2];
    d[i] = d[i + 1] = d[i + 2] = y;
  }
  g.putImageData(img, 0, 0);
  return c;
}

/** Hasil: teks mentah OCR. onProgress menerima 0..1. */
export async function bacaScreenshot(file: Blob, onProgress: (p: number) => void): Promise<string> {
  const T = await import("tesseract.js");
  const worker = await T.createWorker("eng", T.OEM.LSTM_ONLY, {
    logger: (m) => { if (m.status === "recognizing text") onProgress(m.progress); },
  });
  try {
    // SINGLE_BLOCK cocok untuk tabel 2 kolom; spasi antar-kata dipertahankan supaya kolom qty tetap terpisah
    await worker.setParameters({ tessedit_pageseg_mode: T.PSM.SINGLE_BLOCK, preserve_interword_spaces: "1" });
    const { data } = await worker.recognize(await siapkanGambar(file));
    return data.text;
  } finally {
    await worker.terminate();
  }
}
