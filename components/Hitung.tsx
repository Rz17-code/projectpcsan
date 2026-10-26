"use client";
import { Fragment, useEffect, useMemo, useRef, useState } from "react";
import { fmt, hitung, pasteToRows, rapikanTeksOcr, resolve, rowsToInput, type Komponen } from "@/lib/pcsan";
import { downloadXlsx, readWorkbook, sheetRows, type Workbook } from "@/lib/excel";
import { simpanRiwayat } from "@/lib/api";
import { bacaScreenshot } from "@/lib/ocr";
import type { Ctx, DataInput } from "./App";

const sesiBaru = () => Date.now().toString(36) + Math.random().toString(36).slice(2, 8);

export default function Hitung({ ctx, data, setData }: { ctx: Ctx; data: DataInput; setData: React.Dispatch<React.SetStateAction<DataInput>> }) {
  const { master } = ctx;
  const [wb, setWb] = useState<{ wb: Workbook; file: string } | null>(null);
  const [sheet, setSheet] = useState("");
  const [paste, setPaste] = useState("");
  const [hover, setHover] = useState(false);
  const [hideZero, setHideZero] = useState(true);
  const [open, setOpen] = useState<Record<number, boolean>>({});
  const [pasteOpen, setPasteOpen] = useState(false);
  const [ocr, setOcr] = useState<number | null>(null); // progres baca screenshot 0..1, null = tidak sedang membaca
  const [shot, setShot] = useState<{ url: string; nama: string; tanpaAngka: string[]; ragu: string[] } | null>(null);
  const fileRef = useRef<HTMLInputElement>(null);

  // Ctrl+V gambar (mis. dari Win+Shift+S) di halaman ini langsung dibaca sebagai screenshot
  useEffect(() => {
    const f = (e: ClipboardEvent) => {
      const img = [...(e.clipboardData?.files || [])].find((x) => x.type.startsWith("image/"));
      if (!img) return;
      e.preventDefault();
      onScreenshot(img, "tempel " + new Date().toLocaleTimeString("id-ID"));
    };
    document.addEventListener("paste", f);
    return () => document.removeEventListener("paste", f);
  });

  // hasil selalu dihitung ulang otomatis bila master / mapping berubah
  const H = useMemo(
    () => (data.input.length ? hitung(master, data.input, data.totalFile, data.judul, data.sumber) : null),
    [master, data],
  );

  // ---- simpan otomatis ke Riwayat: 1 input = 1 entri; perubahan berikutnya (keterangan, mapping, koreksi
  // screenshot, nama) memperbarui entri yang sama. Data yang dibuka dari Riwayat tidak disimpan ulang.
  const [status, setStatus] = useState<"" | "menyimpan" | "tersimpan" | "gagal">("");
  const [ulang, setUlang] = useState(0);
  const antre = useRef<Promise<unknown>>(Promise.resolve());
  const idSesi = useRef<{ sesi: string; id: string } | null>(null);
  const terakhir = useRef("");

  useEffect(() => setStatus(""), [data.sesi]);
  useEffect(() => {
    if (!H || !data.otomatis || !data.sesi) return;
    const sesi = data.sesi;
    const payload = { ...H, judul: data.judul || `Tanpa keterangan (${data.sumber})`, oleh: ctx.user };
    const s = JSON.stringify(payload);
    if (s === terakhir.current) return;
    const t = setTimeout(() => {
      antre.current = antre.current.then(async () => {
        if (s === terakhir.current) return;
        setStatus("menyimpan");
        const id = await simpanRiwayat(data.riwayatId || (idSesi.current?.sesi === sesi ? idSesi.current.id : null), payload);
        if (!id) { setStatus("gagal"); return; }
        idSesi.current = { sesi, id };
        terakhir.current = s;
        setStatus("tersimpan");
        setData((d) => (d.sesi === sesi && d.riwayatId !== id ? { ...d, riwayatId: id } : d));
      });
    }, 1500);
    return () => clearTimeout(t);
  }, [H, ctx.user, ulang]); // eslint-disable-line react-hooks/exhaustive-deps

  /**
   * lanjut = koreksi dari input yang sama (mis. Hitung ulang screenshot) -> perbarui entri Riwayat yang sama.
   * Keterangan yang diketik sebelum ada data tetap dipakai; input baru setelah itu mulai dari judulAwal (mis. nama file).
   */
  function pakai(rows: unknown[][], sumber: string, judulAwal = "", lanjut = false) {
    const r = rowsToInput(rows);
    if (!r.out.length) { alert("Tidak ada data terbaca. Pastikan ada kolom Nama dan qty."); return; }
    setOpen({});
    const tetap = lanjut && data.otomatis && data.sesi;
    const judul = tetap || !data.input.length ? data.judul || judulAwal : judulAwal;
    setData({
      input: r.out, totalFile: r.total, sumber, judul, otomatis: true,
      sesi: tetap ? data.sesi : sesiBaru(), riwayatId: tetap ? data.riwayatId : null,
    });
  }
  async function onScreenshot(f: Blob, nama: string) {
    if (ocr != null) return;
    setOcr(0);
    try {
      const o = await bacaScreenshot(f, setOcr);
      const r = rapikanTeksOcr(o.teks);
      if (shot) URL.revokeObjectURL(shot.url);
      setShot({ url: URL.createObjectURL(f), nama, tanpaAngka: r.tanpaAngka, ragu: o.ragu });
      setPaste(r.teks);
      setPasteOpen(true);
      setWb(null);
      pakai(pasteToRows(r.teks), `screenshot | ${nama}`);
    } catch (e: any) {
      alert("Gagal membaca screenshot: " + (e?.message || e) + "\nCek koneksi internet (mesin OCR diunduh saat pertama kali dipakai).");
    } finally {
      setOcr(null);
    }
  }
  async function onFile(f: File | undefined) {
    if (!f) return;
    if (f.type.startsWith("image/")) return onScreenshot(f, f.name);
    if (shot) { URL.revokeObjectURL(shot.url); setShot(null); }
    const w = await readWorkbook(f);
    setWb({ wb: w, file: f.name });
    setSheet(w.SheetNames[0]);
    pakai(sheetRows(w, w.SheetNames[0]), `${f.name} | ${w.SheetNames[0]}`, f.name.replace(/\.[^.]+$/, ""));
  }

  const tanpaHarga = H ? H.baris.filter((b) => b.pcs > 0 && b.harga == null) : [];
  const otomatis = H
    ? [...new Set(H.input.map((r) => r.nama))]
        .map((nama) => ({ nama, res: resolve(master, nama)! }))
        .filter((x) => x.res?.cara === "otomatis")
    : [];
  async function konfirmasi(nama: string, komponen: Komponen[]) {
    if (await ctx.simpanMaster({ ...master, mapping: [...master.mapping, { nama, komponen: komponen.map((k) => ({ ...k })) }] })) {
      ctx.toast(`"${nama}" disimpan sebagai mapping`);
    }
  }
  let grup: string | null = null;

  return (
    <section>
      <div className="card">
        <h2>1. Masukkan data (format: Nama | qty)</h2>
        {!ctx.user && (
          <div className="msg warn">Setiap input otomatis tersimpan di Riwayat. Isi <b>Nama Anda</b> di kanan atas supaya tercatat siapa yang menginput.</div>
        )}
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
          {ocr != null ? (
            <b>Membaca screenshot... {Math.round(ocr * 100)}%</b>
          ) : (
            <>
              <b>Klik atau seret file Excel / screenshot ke sini</b><br />
              <span style={{ fontSize: 12 }}>
                atau tekan <b>Ctrl+V</b> untuk menempel screenshot. Kolom <b>Nama</b> dan <b>qty</b>, baris <b>Total Keseluruhan</b> otomatis dipakai untuk cek
                (sertakan juga di screenshot).
              </span>
            </>
          )}
          <input ref={fileRef} data-testid="file" type="file" accept=".xlsx,.xls,.xlsm,.csv,image/*" className="hide"
            onChange={(e) => { onFile(e.target.files?.[0]); e.target.value = ""; }} />
        </div>
        {wb && wb.wb.SheetNames.length > 1 && (
          <div className="row" style={{ marginTop: 8 }}>
            <span className="muted">Sheet:</span>
            <select value={sheet} onChange={(e) => { setSheet(e.target.value); pakai(sheetRows(wb.wb, e.target.value), `${wb.file} | ${e.target.value}`, wb.file.replace(/\.[^.]+$/, "")); }}>
              {wb.wb.SheetNames.map((n) => <option key={n}>{n}</option>)}
            </select>
          </div>
        )}
        <details style={{ marginTop: 12 }} open={pasteOpen} onToggle={(e) => setPasteOpen(e.currentTarget.open)}>
          <summary style={{ cursor: "pointer", color: "var(--brand)" }}>{shot ? "hasil baca screenshot (cek & betulkan di sini)" : "atau copy-paste dari Excel"}</summary>
          <p className="muted" style={{ margin: "6px 0" }}>
            {shot
              ? "Cocokkan teks dengan gambar. Kalau ada nama/angka yang salah baca, betulkan di kotak teks (jangan dipetakan), lalu klik Hitung ulang."
              : "Blok kolom Nama dan qty di Excel → Ctrl+C → tempel di bawah → klik Hitung."}
          </p>
          <div style={{ display: "grid", gridTemplateColumns: shot ? "repeat(auto-fit,minmax(280px,1fr))" : "1fr", gap: 10 }}>
            {shot && (
              <div className="scroll" style={{ maxHeight: 420 }}>
                <img src={shot.url} alt={"screenshot " + shot.nama} style={{ width: "100%", display: "block" }} />
              </div>
            )}
            <textarea data-testid="paste" value={paste} onChange={(e) => setPaste(e.target.value)} style={shot ? { minHeight: 420 } : undefined}
              placeholder={"BUNDLING SERUM GB NIACINAMIDE + ALPHA ARBUTIN\t1.821\nGLOWBOOSTER SUNSCREEN 30 ML\t350\n..."} />
          </div>
          {shot && shot.ragu.length > 0 && (
            <div className="msg bad" style={{ marginTop: 8 }} data-testid="ragu">
              ✖ <b>Angka ragu</b> — dibaca berbeda di dua kali baca dan tidak bisa dipastikan lewat Total. Cocokkan dengan gambar:
              {shot.ragu.map((x) => <div key={x}>• {x}</div>)}
            </div>
          )}
          {shot && shot.tanpaAngka.length > 0 && (
            <div className="msg warn" style={{ marginTop: 8 }}>
              ⚠ {shot.tanpaAngka.length} baris tidak ada angka qty-nya sehingga <b>tidak dihitung</b>. Kalau itu nama barang, tambahkan qty-nya:{" "}
              {shot.tanpaAngka.slice(0, 8).join(" · ")}{shot.tanpaAngka.length > 8 ? " · ..." : ""}
            </div>
          )}
          <div className="row" style={{ marginTop: 8 }}>
            <button className="btn p" onClick={() => { setWb(null); pakai(pasteToRows(paste), shot ? `screenshot | ${shot.nama} (dikoreksi)` : "paste", undefined, !!shot); }}>
              {shot ? "Hitung ulang" : "Hitung dari paste"}
            </button>
            <button className="btn" onClick={() => { setPaste(""); if (shot) URL.revokeObjectURL(shot.url); setShot(null); }}>Kosongkan</button>
          </div>
        </details>
      </div>

      {H && (
        <>
          <div data-testid="pesan">
            {data.sumber.startsWith("screenshot") && (
              <div className="msg warn">
                📷 Data dibaca dari <b>screenshot (OCR)</b> — cocokkan nama &amp; qty dengan gambar di bagian 1 sebelum dipakai.
                {H.total_file == null && <> Screenshot <b>tidak memuat baris Total Keseluruhan</b>, jadi tidak ada cek otomatis — sebaiknya ikutkan baris total.</>}
              </div>
            )}
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
            {otomatis.length > 0 && (
              <div className="msg warn" data-testid="otomatis">
                ⚠ <b>{otomatis.length} nama dikenali otomatis</b> dari awal namanya dan <b>sudah dihitung</b> — cek, lalu Konfirmasi supaya jadi mapping tetap:
                {otomatis.map(({ nama, res }) => (
                  <div key={nama} style={{ marginTop: 4 }}>
                    <b>{nama}</b> → {res.komponen.map((k) => `${k.produk} × ${fmt(k.qty)}`).join(" + ")}{" "}
                    <button className="btn s" onClick={() => konfirmasi(nama, res.komponen)}>Konfirmasi</button>{" "}
                    <button className="btn s" onClick={() => ctx.bukaMapping(null, nama)}>Ubah</button>
                  </div>
                ))}
                {data.sumber.startsWith("screenshot") && (
                  <div className="muted" style={{ marginTop: 4, fontSize: 12 }}>Kalau namanya salah baca OCR, betulkan di kotak teks saja (jangan dikonfirmasi).</div>
                )}
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
              {data.otomatis ? (
                <span className="muted" style={{ fontSize: 12 }} data-testid="status-riwayat">
                  {status === "menyimpan" && "Menyimpan ke Riwayat..."}
                  {status === "tersimpan" && <span style={{ color: "var(--ok)" }}>✔ Tersimpan otomatis di Riwayat</span>}
                  {status === "gagal" && <><span style={{ color: "var(--bad)" }}>✖ Gagal menyimpan ke Riwayat</span>{" "}
                    <button className="btn s" onClick={() => setUlang(ulang + 1)}>Coba lagi</button></>}
                </span>
              ) : (
                <span className="muted" style={{ fontSize: 12 }}>Dibuka dari Riwayat (tidak disimpan ulang)</span>
              )}
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
                          ) : res.cara === "mapping" ? <span className="tag map">mapping</span>
                            : res.cara === "otomatis" ? <span className="tag auto" title={"dikenali dari awalan: " + res.dari}>otomatis</span>
                            : <span className="tag ok">nama produk</span>}
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
