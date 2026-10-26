"use client";
import { useEffect, useRef, useState } from "react";
import { fmt, norm, parseQty, type Mapping, type Produk } from "@/lib/pcsan";
import { readWorkbook, sheetRows } from "@/lib/excel";
import type { Ctx } from "./App";

const clone = <T,>(x: T): T => JSON.parse(JSON.stringify(x));

export default function MasterHarga({ ctx }: { ctx: Ctx }) {
  const { master } = ctx;
  const [produk, setProduk] = useState<Produk[]>(() => clone(master.produk));
  const [mapping, setMapping] = useState<Mapping[]>(() => clone(master.mapping));
  const [dirty, setDirty] = useState(false);
  const [cari, setCari] = useState("");
  const fileRef = useRef<HTMLInputElement>(null);

  // muat ulang draft saat master berubah dari luar (disimpan / konflik)
  useEffect(() => {
    setProduk(clone(master.produk));
    setMapping(clone(master.mapping));
    setDirty(false);
  }, [master]);

  const dipakai = new Set(mapping.flatMap((m) => m.komponen.map((k) => norm(k.produk))));
  const grups = [...new Set(produk.map((p) => p.grup || ""))];

  function ubah(i: number, f: keyof Produk, raw: string) {
    const p = [...produk];
    const it = { ...p[i] };
    if (f === "harga") {
      const v = parseQty(raw);
      it.harga = raw.trim() === "" || v == null ? null : v;
    } else if (f === "nama") {
      const nv = raw.trim();
      if (!nv) return;
      if (p.some((x, j) => j !== i && norm(x.nama) === norm(nv))) { alert("Nama produk sudah ada."); return; }
      const old = it.nama;
      it.nama = nv;
      // ganti juga nama produk di mapping
      setMapping(mapping.map((m) => ({ ...m, komponen: m.komponen.map((k) => (norm(k.produk) === norm(old) ? { ...k, produk: nv } : k)) })));
    } else {
      it.grup = raw.trim();
    }
    p[i] = it;
    setProduk(p);
    setDirty(true);
  }
  function hapus(i: number) {
    const p = produk[i];
    if (dipakai.has(norm(p.nama))) { alert(`"${p.nama}" dipakai di Mapping Bundling. Hapus/ubah mapping-nya dulu.`); return; }
    if (!confirm(`Hapus produk "${p.nama}"?`)) return;
    setProduk(produk.filter((_, j) => j !== i));
    setDirty(true);
  }
  function naik(i: number) {
    if (i < 1) return;
    const p = [...produk];
    [p[i - 1], p[i]] = [p[i], p[i - 1]];
    setProduk(p);
    setDirty(true);
  }
  function tambah() {
    const n = prompt("Nama produk baru:");
    if (!n || !n.trim()) return;
    if (produk.some((p) => norm(p.nama) === norm(n))) { alert("Produk sudah ada."); return; }
    const g = prompt("Grup (contoh: KYURA & GLOW BOOSTER):", produk.length ? produk[produk.length - 1].grup : "") || "";
    const h = parseQty(prompt("Harga jual per pcs (inc PPN), boleh kosong:") || "");
    setProduk([...produk, { nama: n.trim(), grup: g.trim(), harga: h || null }]);
    setDirty(true);
  }
  async function importHarga(f: File | undefined) {
    if (!f) return;
    const wb = await readWorkbook(f);
    const rows = sheetRows(wb, wb.SheetNames[0]);
    let hi = -1, cn = 0, ch = 1;
    for (let i = 0; i < Math.min(rows.length, 30); i++) {
      const r = rows[i] || [];
      let a = -1, b = -1;
      r.forEach((c, j) => { const t = norm(c); if (a < 0 && t.includes("NAMA")) a = j; if (b < 0 && t.includes("HARGA")) b = j; });
      if (a >= 0 && b >= 0) { hi = i; cn = a; ch = b; break; }
    }
    if (hi < 0) { alert("Kolom NAMA PRODUK dan HARGA tidak ditemukan."); return; }
    const p = clone(produk);
    let baru = 0, ubahN = 0;
    for (let i = hi + 1; i < rows.length; i++) {
      const r = rows[i] || [];
      const n = String(r[cn] ?? "").trim();
      if (!n) continue;
      const hv = r[ch] == null || r[ch] === "" ? null : parseQty(r[ch]);
      const ex = p.find((x) => norm(x.nama) === norm(n));
      if (ex) { if (ex.harga !== hv) { ex.harga = hv; ubahN++; } }
      else { p.push({ nama: n, grup: p.length ? p[p.length - 1].grup : "", harga: hv }); baru++; }
    }
    setProduk(p);
    setDirty(true);
    alert(`Import selesai: ${ubahN} harga diperbarui, ${baru} produk baru.\nCek lalu klik Simpan.`);
  }
  async function simpan() {
    if (await ctx.simpanMaster({ ...master, produk, mapping })) ctx.toast("Master harga tersimpan");
  }

  const q = norm(cari);
  return (
    <section>
      <div className="card">
        <div className="row" style={{ marginBottom: 10 }}>
          <h2 style={{ margin: 0 }} className="grow">Master Harga Jual per Pcs (inc PPN)</h2>
          <input type="text" placeholder="cari produk..." value={cari} onChange={(e) => setCari(e.target.value)} />
          <button className="btn" onClick={() => fileRef.current?.click()}>Import dari Excel</button>
          <input ref={fileRef} type="file" accept=".xlsx,.xls,.csv" className="hide" onChange={(e) => { importHarga(e.target.files?.[0]); e.target.value = ""; }} />
          <button className="btn" onClick={tambah}>+ Produk</button>
          <button className="btn p" onClick={simpan} disabled={!dirty}>{dirty ? "Simpan *" : "Tersimpan"}</button>
        </div>
        <p className="muted" style={{ margin: "0 0 8px", fontSize: 12 }}>
          Import mengikuti format file harga: kolom <b>NAMA PRODUK</b> dan <b>HARGA JUAL (INC PPN)</b>. Produk yang sudah ada diperbarui harganya,
          produk baru ditambahkan. Harga kosong = belum ada harga.
        </p>
        {master.diubah && <div className="muted" style={{ fontSize: 12, marginBottom: 6 }}>Terakhir diubah {master.diubah}{master.oleh ? " oleh " + master.oleh : ""}</div>}
        <div className="scroll">
          <table>
            <thead><tr><th>#</th><th>Nama produk</th><th>Grup</th><th className="n">Harga jual / pcs (inc PPN)</th><th></th></tr></thead>
            <tbody>
              {produk.map((p, i) =>
                q && !norm(p.nama).includes(q) ? null : (
                  <tr key={i + "|" + p.nama}>
                    <td className="muted">{i + 1}</td>
                    <td><input type="text" defaultValue={p.nama} style={{ width: "100%" }} onBlur={(e) => e.target.value !== p.nama && ubah(i, "nama", e.target.value)} /></td>
                    <td><input type="text" defaultValue={p.grup || ""} list="dlGrup" style={{ width: "100%" }} onBlur={(e) => e.target.value !== (p.grup || "") && ubah(i, "grup", e.target.value)} /></td>
                    <td className="n">
                      <input type="text" key={String(p.harga)} defaultValue={p.harga == null ? "" : fmt(p.harga)} placeholder="kosong"
                        style={{ width: 130, textAlign: "right" }} onBlur={(e) => ubah(i, "harga", e.target.value)} />
                    </td>
                    <td className="n">
                      <button className="btn s" title="naik" onClick={() => naik(i)}>▲</button>{" "}
                      <button className="btn s d" onClick={() => hapus(i)}>hapus</button>
                    </td>
                  </tr>
                ),
              )}
            </tbody>
          </table>
          <datalist id="dlGrup">{grups.map((g) => <option key={g} value={g} />)}</datalist>
        </div>
      </div>
    </section>
  );
}
