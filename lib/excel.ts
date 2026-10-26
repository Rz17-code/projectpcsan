// Baca & tulis Excel di browser (SheetJS).
import * as XLSX from "xlsx";
import type { Hasil, Master } from "./pcsan";
import { resolve } from "./pcsan";

export type Workbook = XLSX.WorkBook;

export async function readWorkbook(file: File): Promise<Workbook> {
  const buf = await file.arrayBuffer();
  return XLSX.read(buf, { type: "array" });
}

export function sheetRows(wb: Workbook, name: string): unknown[][] {
  return XLSX.utils.sheet_to_json(wb.Sheets[name], { header: 1, raw: true, defval: null }) as unknown[][];
}

function numFmt(ws: XLSX.WorkSheet, cols: number[], startRow: number) {
  const rg = XLSX.utils.decode_range(ws["!ref"]!);
  for (let R = startRow; R <= rg.e.r; R++)
    for (const C of cols) {
      const c = ws[XLSX.utils.encode_cell({ r: R, c: C })];
      if (c && c.t === "n") c.z = "#,##0";
    }
}

export function downloadXlsx(H: Hasil, master: Master, user: string) {
  const wb = XLSX.utils.book_new();
  const a: unknown[][] = [
    ["PCSAN OTOMATIS"],
    ["Keterangan", H.judul || ""],
    ["Sumber data", H.sumber || ""],
    ["Dibuat", new Date().toLocaleString("id-ID") + (user ? " oleh " + user : "")],
    [],
    ["NAMA PRODUK", "QTY (PCS)", "HARGA JUAL (INC PPN)", "NILAI"],
  ];
  let g: string | null = null;
  for (const b of H.baris) {
    if (b.grup !== g) { g = b.grup; a.push([g || ""]); }
    a.push([b.nama, b.pcs || 0, b.harga == null ? "" : b.harga, b.pcs ? b.nilai : 0]);
  }
  a.push(["TOTAL", H.total_pcs, "", H.total_nilai]);
  const ws = XLSX.utils.aoa_to_sheet(a);
  numFmt(ws, [1, 2, 3], 6);
  ws["!cols"] = [{ wch: 42 }, { wch: 12 }, { wch: 22 }, { wch: 16 }];
  XLSX.utils.book_append_sheet(wb, ws, "HASIL PCSAN");

  const r: unknown[][] = [["NAMA PRODUK", "DARI NAMA BARANG", "QTY NAMA BARANG", "PCS PER QTY", "PCS"]];
  H.baris.forEach((b) => b.asal.forEach((x) => r.push([b.nama, x.nama, x.qty, x.x, x.pcs])));
  const ws2 = XLSX.utils.aoa_to_sheet(r);
  numFmt(ws2, [2, 3, 4], 1);
  ws2["!cols"] = [{ wch: 36 }, { wch: 58 }, { wch: 16 }, { wch: 12 }, { wch: 10 }];
  XLSX.utils.book_append_sheet(wb, ws2, "RINCIAN BUNDLING");

  const inp: unknown[][] = [["Nama", "qty", "STATUS"]];
  for (const x of H.input) {
    const rs = resolve(master, x.nama);
    inp.push([x.nama, x.qty, rs ? (rs.cara === "mapping" ? "mapping" : "nama produk") : "BELUM DIKENAL - tidak dihitung"]);
  }
  inp.push(["Total (terbaca)", H.total_input, ""]);
  if (H.total_file != null) inp.push(["Total Keseluruhan di file", H.total_file, H.total_file === H.total_input ? "COCOK" : "TIDAK COCOK"]);
  const ws3 = XLSX.utils.aoa_to_sheet(inp);
  numFmt(ws3, [1], 1);
  ws3["!cols"] = [{ wch: 58 }, { wch: 10 }, { wch: 30 }];
  XLSX.utils.book_append_sheet(wb, ws3, "INPUT");

  const fn = ("PCSAN " + (H.judul || new Date().toISOString().slice(0, 10))).replace(/[\\/:*?"<>|]/g, "-") + ".xlsx";
  XLSX.writeFile(wb, fn);
}
