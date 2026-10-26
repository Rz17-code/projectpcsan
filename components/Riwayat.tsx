"use client";
import { useCallback, useEffect, useState } from "react";
import { fmt } from "@/lib/pcsan";
import { deleteRiwayat, getRiwayat, listRiwayat } from "@/lib/api";
import { downloadXlsx } from "@/lib/excel";
import type { Ctx, DataInput } from "./App";

type Item = { id: string; judul: string; dibuat: string; oleh: string; total_pcs: number; total_nilai: number };

export default function Riwayat({ ctx, onBuka }: { ctx: Ctx; onBuka: (d: DataInput) => void }) {
  const [items, setItems] = useState<Item[] | null>(null);
  const muat = useCallback(() => { listRiwayat().then(setItems); }, []);
  useEffect(muat, [muat]);

  return (
    <section>
      <div className="card">
        <div className="row" style={{ marginBottom: 10 }}>
          <h2 style={{ margin: 0 }} className="grow">Riwayat Perhitungan</h2>
          <button className="btn" onClick={muat}>Muat ulang</button>
        </div>
        <p className="muted" style={{ margin: "0 0 8px", fontSize: 12 }}>
          <b>Excel</b> = hasil persis seperti saat disimpan. <b>Buka</b> = data input dihitung ulang dengan master harga &amp; mapping terbaru.
        </p>
        <div className="scroll">
          <table>
            <thead><tr><th>Keterangan</th><th>Dibuat</th><th>Oleh</th><th className="n">Total pcs</th><th className="n">Total nilai</th><th></th></tr></thead>
            <tbody>
              {items === null && <tr><td colSpan={6} className="muted">Memuat...</td></tr>}
              {items?.length === 0 && <tr><td colSpan={6} className="muted">Belum ada riwayat.</td></tr>}
              {items?.map((x) => (
                <tr key={x.id}>
                  <td>{x.judul}</td><td>{x.dibuat}</td><td>{x.oleh || <span className="muted">(tanpa nama)</span>}</td>
                  <td className="n">{fmt(x.total_pcs)}</td><td className="n">{fmt(x.total_nilai)}</td>
                  <td className="n">
                    <button className="btn s" onClick={async () => {
                      const H = await getRiwayat(x.id);
                      onBuka({ input: H.input, totalFile: H.total_file, sumber: H.sumber || "", judul: H.judul || "" });
                    }}>buka</button>{" "}
                    <button className="btn s" onClick={async () => downloadXlsx(await getRiwayat(x.id), ctx.master, ctx.user)}>Excel</button>{" "}
                    <button className="btn s d" onClick={async () => { if (confirm("Hapus riwayat ini?")) { await deleteRiwayat(x.id); muat(); } }}>hapus</button>
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
