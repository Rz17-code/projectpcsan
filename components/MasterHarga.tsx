"use client";
import { useEffect, useMemo, useRef, useState } from "react";
import { fmt, norm, parseHarga, type Mapping, type Produk } from "@/lib/pcsan";
import { readWorkbook, sheetRows } from "@/lib/excel";
import type { Ctx } from "./App";

const clone = <T,>(x: T): T => JSON.parse(JSON.stringify(x));

/** Ganti nama produk di komponen mapping sesuai daftar [nama lama, nama baru] (berurutan). */
function terapkanRename(mapping: Mapping[], renames: [string, string][]): Mapping[] {
  return renames.reduce(
    (ms, [lama, baru]) => ms.map((m) => ({ ...m, komponen: m.komponen.map((k) => (norm(k.produk) === norm(lama) ? { ...k, produk: baru } : k)) })),
    mapping,
  );
}

export default function MasterHarga({ ctx, onDirty }: { ctx: Ctx; onDirty: (dirty: boolean) => void }) {
  const { master } = ctx;
  const [produk, setProduk] = useState<Produk[]>(() => clone(master.produk));
  // rename produk disimpan terpisah lalu diterapkan ke mapping TERBARU, supaya mapping yang disimpan dari popup "Petakan" tidak tertimpa
  const [renames, setRenames] = useState<[string, string][]>([]);
  const [dirty, setDirty] = useState(false);
  const [cari, setCari] = useState("");
  const fileRef = useRef<HTMLInputElement>(null);
  const base = useRef(JSON.stringify(master.produk));

  // muat ulang draft hanya bila daftar produk berubah dari luar (disimpan / konflik);
  // bila yang berubah cuma mapping, draft harga yang belum disimpan tetap dipertahankan
  useEffect(() => {
    const s = JSON.stringify(master.produk);
    if (s === base.current) return;
    base.current = s;
    setProduk(clone(master.produk));
    setRenames([]);
    setDirty(false);
  }, [master]);

  useEffect(() => onDirty(dirty), [dirty, onDirty]);

  const mapping = useMemo(() => terapkanRename(master.mapping, renames), [master.mapping, renames]);
  const dipakai = new Set(mapping.flatMap((m) => m.komponen.map((k) => norm(k.produk))));
  const grups = [...new Set(produk.map((p) => p.grup || ""))];

  /** false = perubahan ditolak (isian dikembalikan ke nilai lama) */
  function ubah(i: number, f: keyof Produk, raw: string): boolean {
    const p = [...produk];
    const it = { ...p[i] };
    if (f === "harga") {
      const v = parseHarga(raw);
      if (v === undefined) { alert(`Harga "${raw}" tidak terbaca. Harga lama tetap dipakai.`); return false; }
      if (v === it.harga) return true;
      it.harga = v;
    } else if (f === "nama") {
      const nv = raw.trim();
      if (!nv) return false;
      if (p.some((x, j) => j !== i && norm(x.nama) === norm(nv))) { alert("Nama produk sudah ada."); return false; }
      setRenames([...renames, [it.nama, nv]]);
      it.nama = nv;
    } else {
      it.grup = raw.trim();
    }
    p[i] = it;
    setProduk(p);
    setDirty(true);
    return true;
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
    const raw = prompt("Harga jual per pcs (inc PPN), boleh kosong:") || "";
    const h = parseHarga(raw);
    if (h === undefined) { alert(`Harga "${raw}" tidak terbaca. Produk belum ditambahkan.`); return; }
    setProduk([...produk, { nama: n.trim(), grup: g.trim(), harga: h }]);
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
    const gagal: string[] = [];
    for (let i = hi + 1; i < rows.length; i++) {
      const r = rows[i] || [];
      const n = String(r[cn] ?? "").trim();
      if (!n) continue;
      const hv = parseHarga(r[ch]);
      if (hv === undefined) { gagal.push(`${n} ("${r[ch]}")`); continue; }
      const ex = p.find((x) => norm(x.nama) === norm(n));
      if (ex) { if (ex.harga !== hv) { ex.harga = hv; ubahN++; } }
      else { p.push({ nama: n, grup: p.length ? p[p.length - 1].grup : "", harga: hv }); baru++; }
    }
    setProduk(p);
    if (ubahN || baru) setDirty(true);
    let pesan = `Import selesai: ${ubahN} harga diperbarui, ${baru} produk baru.`;
    if (gagal.length) {
      pesan += `\n\n${gagal.length} baris harganya TIDAK TERBACA dan DIABAIKAN (harga lama tetap dipakai):\n` +
        gagal.slice(0, 10).join("\n") + (gagal.length > 10 ? `\n... dan ${gagal.length - 10} lainnya` : "");
    }
    alert(pesan + "\n\nCek lalu klik Simpan.");
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
        {dirty && <div className="msg warn">⚠ Ada perubahan yang <b>belum disimpan</b>. Hasil di tab Hitung masih memakai harga yang tersimpan.</div>}
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
                    <td><input type="text" defaultValue={p.nama} style={{ width: "100%" }}
                      onBlur={(e) => e.target.value !== p.nama && !ubah(i, "nama", e.target.value) && (e.target.value = p.nama)} /></td>
                    <td><input type="text" defaultValue={p.grup || ""} list="dlGrup" style={{ width: "100%" }} onBlur={(e) => e.target.value !== (p.grup || "") && ubah(i, "grup", e.target.value)} /></td>
                    <td className="n">
                      <input type="text" key={String(p.harga)} defaultValue={p.harga == null ? "" : fmt(p.harga)} placeholder="kosong"
                        style={{ width: 130, textAlign: "right" }}
                        onBlur={(e) => { if (!ubah(i, "harga", e.target.value)) e.target.value = p.harga == null ? "" : fmt(p.harga); }} />
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
