"use client";
import { useState } from "react";
import { fmt, norm } from "@/lib/pcsan";
import type { Ctx } from "./App";

export default function MappingTab({ ctx }: { ctx: Ctx }) {
  const { master } = ctx;
  const [cari, setCari] = useState("");
  const q = norm(cari);

  async function hapus(i: number) {
    const m = master.mapping[i];
    if (!confirm(`Hapus mapping "${m.nama}"?`)) return;
    const mapping = master.mapping.filter((_, j) => j !== i);
    if (await ctx.simpanMaster({ ...master, mapping })) ctx.toast("Mapping dihapus");
  }

  const rows = master.mapping
    .map((m, i) => ({ m, i }))
    .sort((a, b) => norm(a.m.nama).localeCompare(norm(b.m.nama)))
    .filter(({ m }) => !q || norm(m.nama).includes(q) || m.komponen.some((k) => norm(k.produk).includes(q)));

  return (
    <section>
      <div className="card">
        <div className="row" style={{ marginBottom: 10 }}>
          <h2 style={{ margin: 0 }} className="grow">Mapping Nama Barang → Produk</h2>
          <input type="text" placeholder="cari..." value={cari} onChange={(e) => setCari(e.target.value)} />
          <button className="btn p" onClick={() => ctx.bukaMapping(null, "")}>+ Mapping</button>
        </div>
        <p className="muted" style={{ margin: "0 0 8px", fontSize: 12 }}>
          Aturan: setiap komponen bundling mendapat qty yang sama dengan qty bundling × jumlah pcs komponen. Nama barang yang <b>persis sama</b> dengan
          nama di Master Harga otomatis dikenali tanpa mapping. Huruf besar/kecil dan spasi ganda diabaikan.
        </p>
        <div className="scroll">
          <table>
            <thead><tr><th>Nama barang (di data penjualan)</th><th>Dipecah menjadi (per 1 qty)</th><th className="n">Pcs</th><th></th></tr></thead>
            <tbody>
              {rows.map(({ m, i }) => (
                <tr key={m.nama}>
                  <td>{m.nama}</td>
                  <td>{m.komponen.map((k, j) => <div key={j}>{k.produk} × {fmt(k.qty)}</div>)}</td>
                  <td className="n">{fmt(m.komponen.reduce((a, k) => a + Number(k.qty || 0), 0))}</td>
                  <td className="n">
                    <button className="btn s" onClick={() => ctx.bukaMapping(i)}>ubah</button>{" "}
                    <button className="btn s d" onClick={() => hapus(i)}>hapus</button>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </div>
    </section>
  );
}
