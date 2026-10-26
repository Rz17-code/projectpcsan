"use client";
import { useState } from "react";
import { norm, saran, type Komponen } from "@/lib/pcsan";
import type { Ctx, ModalState } from "./App";

export default function MappingModal({ ctx, state, onClose }: { ctx: Ctx; state: NonNullable<ModalState>; onClose: () => void }) {
  const { master } = ctx;
  const edit = state.idx != null ? master.mapping[state.idx] : null;
  const [nama, setNama] = useState(edit ? edit.nama : state.nama);
  const [komp, setKomp] = useState<Komponen[]>(() =>
    edit ? edit.komponen.map((k) => ({ ...k })) : state.nama ? saran(master, state.nama) : [{ produk: "", qty: 1 }],
  );
  const [err, setErr] = useState("");
  const [busy, setBusy] = useState(false);

  const set = (i: number, k: Partial<Komponen>) => setKomp(komp.map((x, j) => (j === i ? { ...x, ...k } : x)));

  async function simpan() {
    const n = nama.trim();
    if (!n) return setErr("Nama barang wajib diisi.");
    if (!komp.length) return setErr("Minimal 1 komponen.");
    if (komp.some((k) => !k.produk)) return setErr("Ada komponen yang belum dipilih produknya.");
    if (komp.some((k) => !(Number(k.qty) > 0))) return setErr("Jumlah pcs harus lebih dari 0.");
    if (master.mapping.some((m, i) => i !== state.idx && norm(m.nama) === norm(n))) return setErr("Nama barang ini sudah punya mapping. Ubah yang sudah ada.");
    const item = { nama: n, komponen: komp.map((k) => ({ produk: k.produk, qty: Number(k.qty) })) };
    const mapping = [...master.mapping];
    if (state.idx != null) mapping[state.idx] = item; else mapping.push(item);
    setBusy(true);
    const ok = await ctx.simpanMaster({ ...master, mapping });
    setBusy(false);
    if (ok) { ctx.toast("Mapping tersimpan"); onClose(); }
  }

  return (
    <div className="modal-bg" onClick={(e) => e.target === e.currentTarget && onClose()}>
      <div className="modal">
        <h3>{edit ? "Ubah mapping" : "Mapping baru"}</h3>
        <p className="muted" style={{ margin: "0 0 12px", fontSize: 12 }}>
          {!edit && state.nama ? "Komponen di bawah adalah SARAN otomatis — periksa dulu sebelum disimpan." : ""}
        </p>
        <label className="muted" style={{ fontSize: 12 }}>Nama barang (seperti di data penjualan)</label>
        <input type="text" value={nama} onChange={(e) => setNama(e.target.value)} style={{ width: "100%", margin: "4px 0 12px" }} />
        <div className="muted" style={{ fontSize: 12, marginBottom: 4 }}>Isi per 1 qty nama barang ini: produk &amp; jumlah pcs</div>
        {komp.map((k, i) => (
          <div className="komp" key={i}>
            <select value={k.produk} onChange={(e) => set(i, { produk: e.target.value })}>
              <option value="">-- pilih produk --</option>
              {master.produk.map((p) => <option key={p.nama} value={p.nama}>{p.nama}</option>)}
            </select>
            <input type="number" min={1} step={1} value={k.qty} onChange={(e) => set(i, { qty: Number(e.target.value) })} />
            <button className="btn s d" onClick={() => setKomp(komp.filter((_, j) => j !== i))}>✕</button>
          </div>
        ))}
        <button className="btn s" onClick={() => setKomp([...komp, { produk: "", qty: 1 }])}>+ komponen</button>
        {err && <div className="msg bad" style={{ marginTop: 10 }}>{err}</div>}
        <div className="row" style={{ justifyContent: "flex-end", marginTop: 16 }}>
          <button className="btn" onClick={onClose}>Batal</button>
          <button className="btn p" data-testid="simpan-mapping" onClick={simpan} disabled={busy}>Simpan Mapping</button>
        </div>
      </div>
    </div>
  );
}
