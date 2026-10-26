"use client";
import { Fragment, useMemo, useRef, useState } from "react";
import { fmt, hitung, pasteToRows, resolve, rowsToInput } from "@/lib/pcsan";
import { downloadXlsx, readWorkbook, sheetRows, type Workbook } from "@/lib/excel";
import { addRiwayat } from "@/lib/api";
import type { Ctx, DataInput } from "./App";

export default function Hitung({ ctx, data, setData }: { ctx: Ctx; data: DataInput; setData: (d: DataInput) => void }) {
  const { master } = ctx;
  const [wb, setWb] = useState<{ wb: Workbook; file: string } | null>(null);
  const [sheet, setSheet] = useState("");
  const [paste, setPaste] = useState("");
  const [hover, setHover] = useState(false);
  const [hideZero, setHideZero] = useState(true);
  const [open, setOpen] = useState<Record<number, boolean>>({});
  const fileRef = useRef<HTMLInputElement>(null);

  // hasil selalu dihitung ulang otomatis bila master / mapping berubah
  const H = useMemo(
    () => (data.input.length ? hitung(master, data.input, data.totalFile, data.judul, data.sumber) : null),
    [master, data],
  );

  function pakai(rows: unknown[][], sumber: string, judul?: string) {
    const r = rowsToInput(rows);
    if (!r.out.length) { alert("Tidak ada data terbaca. Pastikan ada kolom Nama dan qty."); return; }
    setOpen({});
    setData({ input: r.out, totalFile: r.total, sumber, judul: judul ?? data.judul });
  }
  async function onFile(f: File | undefined) {
    if (!f) return;
    const w = await readWorkbook(f);
    setWb({ wb: w, file: f.name });
    setSheet(w.SheetNames[0]);
    pakai(sheetRows(w, w.SheetNames[0]), `${f.name} | ${w.SheetNames[0]}`, data.judul || f.name.replace(/\.[^.]+$/, ""));
  }
  async function simpan() {
    if (!H) return;
    let judul = data.judul;
    if (!judul) {
      judul = prompt("Beri keterangan (contoh: GB Shopee - Oktober 2026)") || "";
      if (!judul) return;
      setData({ ...data, judul });
    }
    const ok = await addRiwayat({ ...H, judul, oleh: ctx.user });
    ok ? ctx.toast("Tersimpan di Riwayat") : alert("Gagal menyimpan");
  }

  const tanpaHarga = H ? H.baris.filter((b) => b.pcs > 0 && b.harga == null) : [];
  let grup: string | null = null;

  return (
    <section>
      <div className="card">
        <h2>1. Masukkan data (format: Nama | qty)</h2>
        <div className="row" style={{ marginBottom: 10 }}>
          <input className="grow" type="text" placeholder="Keterangan, contoh: GB Shopee - Oktober 2026"
            value={data.judul} onChange={(e) => setData({ ...data, judul: e.target.value })} />
        </div>
        <div
          className={"drop" + (hover ? " hover" : "")}
          onClick={() => fileRef.current?.click()}
          onDragOver={(e) => { e.preventDefault(); setHover(true); }}
          onDragLeave={() => setHover(false)}
          onDrop={(e) => { e.preventDefault(); setHover(false); onFile(e.dataTransfer.files[0]); }}
        >
          <b>Klik atau seret file Excel ke sini</b><br />
          <span style={{ fontSize: 12 }}>Kolom <b>Nama</b> dan <b>qty</b>, baris <b>Total Keseluruhan</b> otomatis dipakai untuk cek</span>
          <input ref={fileRef} data-testid="file" type="file" accept=".xlsx,.xls,.xlsm,.csv" className="hide"
            onChange={(e) => { onFile(e.target.files?.[0]); e.target.value = ""; }} />
        </div>
        {wb && wb.wb.SheetNames.length > 1 && (
          <div className="row" style={{ marginTop: 8 }}>
            <span className="muted">Sheet:</span>
            <select value={sheet} onChange={(e) => { setSheet(e.target.value); pakai(sheetRows(wb.wb, e.target.value), `${wb.file} | ${e.target.value}`); }}>
              {wb.wb.SheetNames.map((n) => <option key={n}>{n}</option>)}
            </select>
          </div>
        )}
        <details style={{ marginTop: 12 }}>
          <summary style={{ cursor: "pointer", color: "var(--brand)" }}>atau copy-paste dari Excel</summary>
          <p className="muted" style={{ margin: "6px 0" }}>Blok kolom Nama dan qty di Excel → Ctrl+C → tempel di bawah → klik Hitung.</p>
          <textarea data-testid="paste" value={paste} onChange={(e) => setPaste(e.target.value)}
            placeholder={"BUNDLING SERUM GB NIACINAMIDE + ALPHA ARBUTIN\t1.821\nGLOWBOOSTER SUNSCREEN 30 ML\t350\n..."} />
          <div className="row" style={{ marginTop: 8 }}>
            <button className="btn p" onClick={() => { setWb(null); pakai(pasteToRows(paste), "paste"); }}>Hitung dari paste</button>
            <button className="btn" onClick={() => setPaste("")}>Kosongkan</button>
          </div>
        </details>
      </div>

      {H && (
        <>
          <div data-testid="pesan">
            {H.total_file != null && (H.total_file === H.total_input ? (
              <div className="msg ok">✔ Qty terbaca ({fmt(H.total_input)}) cocok dengan <b>Total Keseluruhan</b> di file ({fmt(H.total_file)}).</div>
            ) : (
              <div className="msg bad">✖ Qty terbaca {fmt(H.total_input)} <b>tidak sama</b> dengan Total Keseluruhan di file {fmt(H.total_file)} (selisih {fmt(H.total_file - H.total_input)}). Cek apakah ada baris yang terlewat.</div>
            ))}
            {H.unknown.length > 0 && (
              <div className="msg bad">
                ✖ <b>{H.unknown.length} nama barang belum dikenal</b> dan BELUM dihitung (qty {fmt(H.unknown.reduce((a, b) => a + b.qty, 0))}):{" "}
                {H.unknown.map((u, i) => (
                  <Fragment key={u.nama}>
                    {i > 0 && " · "}<b>{u.nama}</b>{" "}
                    <button className="btn s" data-testid="petakan" onClick={() => ctx.bukaMapping(null, u.nama)}>Petakan</button>
                  </Fragment>
                ))}
              </div>
            )}
            {H.badKomp.length > 0 && <div className="msg bad">✖ Mapping menunjuk produk yang tidak ada di Master Harga: {H.badKomp.join(" · ")}</div>}
            {tanpaHarga.length > 0 && (
              <div className="msg warn">⚠ Produk ada qty tapi <b>harga kosong</b> (nilai dihitung 0): {tanpaHarga.map((b) => `${b.nama} (${fmt(b.pcs)} pcs)`).join(", ")}</div>
            )}
          </div>

          <div className="stats" data-testid="stats">
            {[
              ["Qty input (baris nama barang)", fmt(H.total_input)],
              ["Total Keseluruhan di file", H.total_file == null ? "–" : fmt(H.total_file)],
              ["Total PCS setelah dipecah", fmt(H.total_pcs)],
              ["Total Nilai (inc PPN)", "Rp " + fmt(H.total_nilai)],
            ].map(([l, v]) => (
              <div className="stat" key={l}><div className="l">{l}</div><div className="v">{v}</div></div>
            ))}
          </div>

          <div className="card">
            <div className="row" style={{ marginBottom: 10 }}>
              <h2 style={{ margin: 0 }} className="grow">2. Hasil PCSAN per produk</h2>
              <label className="muted"><input type="checkbox" checked={hideZero} onChange={(e) => setHideZero(e.target.checked)} /> sembunyikan produk qty 0</label>
              <button className="btn" onClick={simpan}>Simpan ke Riwayat</button>
              <button className="btn p" data-testid="xlsx" onClick={() => downloadXlsx(H, master, ctx.user)}>Download Excel</button>
            </div>
            <p className="muted" style={{ margin: "0 0 8px", fontSize: 12 }}>Klik baris produk untuk melihat asal qty-nya (dari nama barang mana saja).</p>
            <div className="scroll">
              <table data-testid="hasil">
                <thead><tr><th>Nama produk</th><th className="n">Qty (pcs)</th><th className="n">Harga jual / pcs (inc PPN)</th><th className="n">Nilai</th></tr></thead>
                <tbody>
                  {H.baris.map((b, i) => {
                    if (hideZero && !b.pcs) return null;
                    const head = b.grup !== grup ? (grup = b.grup, <tr className="grp"><td colSpan={4}>{b.grup || "-"}</td></tr>) : null;
                    return (
                      <Fragment key={b.nama}>
                        {head}
                        <tr className={b.pcs ? "clk" : "zero"} onClick={() => b.pcs && setOpen({ ...open, [i]: !open[i] })}>
                          <td>{b.pcs ? (open[i] ? "▾ " : "▸ ") : ""}{b.nama}</td>
                          <td className="n">{b.pcs ? fmt(b.pcs) : "-"}</td>
                          <td className="n">{b.harga == null ? <span className="tag bad">kosong</span> : fmt(b.harga)}</td>
                          <td className="n">{b.pcs ? fmt(b.nilai) : "-"}</td>
                        </tr>
                        {open[i] && (
                          <tr className="det"><td colSpan={4}>
                            {b.asal.map((a, j) => <div key={j}>{a.nama}: {fmt(a.qty)} × {fmt(a.x)} = <b>{fmt(a.pcs)}</b></div>)}
                          </td></tr>
                        )}
                      </Fragment>
                    );
                  })}
                  <tr className="tot"><td>TOTAL</td><td className="n">{fmt(H.total_pcs)}</td><td></td><td className="n">{fmt(H.total_nilai)}</td></tr>
                </tbody>
              </table>
            </div>
          </div>

          <div className="card">
            <h2>3. Data input &amp; cara dipecah</h2>
            <div className="scroll">
              <table>
                <thead><tr><th>Nama barang</th><th className="n">Qty</th><th>Status</th><th>Dipecah menjadi</th></tr></thead>
                <tbody>
                  {H.input.map((r, i) => {
                    const res = resolve(master, r.nama);
                    return (
                      <tr key={i}>
                        <td>{r.nama}</td>
                        <td className="n">{fmt(r.qty)}</td>
                        <td>
                          {!res ? (
                            <><span className="tag bad">belum dikenal</span> <button className="btn s" onClick={() => ctx.bukaMapping(null, r.nama)}>Petakan</button></>
                          ) : res.cara === "mapping" ? <span className="tag map">mapping</span> : <span className="tag ok">nama produk</span>}
                        </td>
                        <td>{res?.komponen.map((k, j) => <div key={j}>{k.produk} × {fmt(k.qty)} = <b>{fmt(r.qty * k.qty)}</b></div>)}</td>
                      </tr>
                    );
                  })}
                  <tr className="tot"><td>Total</td><td className="n">{fmt(H.total_input)}</td><td></td><td></td></tr>
                </tbody>
              </table>
            </div>
          </div>
        </>
      )}
    </section>
  );
}
