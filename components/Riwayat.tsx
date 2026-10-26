"use client";
import { Fragment, useCallback, useEffect, useState } from "react";
import { fmt, norm, rekapRiwayat, type Rekap } from "@/lib/pcsan";
import { deleteRiwayat, getRiwayat, getRiwayatBanyak, listRiwayat } from "@/lib/api";
import { downloadRekapXlsx, downloadXlsx } from "@/lib/excel";
import { NAMA_TIM } from "@/lib/tim";
import type { Ctx, DataInput } from "./App";

type Item = { id: string; judul: string; dibuat: string; oleh: string; total_pcs: number; total_nilai: number; sidik?: string };

export default function Riwayat({ ctx, onBuka }: { ctx: Ctx; onBuka: (d: DataInput) => void }) {
  const [items, setItems] = useState<Item[] | null>(null);
  const muat = useCallback(() => { listRiwayat().then(setItems); }, []);
  useEffect(muat, [muat]);

  const [cari, setCari] = useState("");
  const [nama, setNama] = useState(""); // "" = semua, "-" = tanpa nama
  const [bulan, setBulan] = useState(""); // "YYYY-MM"
  const [dari, setDari] = useState("");
  const [sampai, setSampai] = useState("");
  const [pilih, setPilih] = useState<Set<string>>(new Set());
  const [rekap, setRekap] = useState<{ R: Rekap; ket: string } | null>(null);
  const [busy, setBusy] = useState(false);
  const [buka, setBuka] = useState<Record<string, boolean>>({});

  const q = norm(cari);
  // pilihan nama = daftar tim + nama lain yang pernah tercatat di riwayat
  const daftarNama = [...new Set([...NAMA_TIM, ...(items || []).map((x) => x.oleh).filter(Boolean)])]
    .filter((n, i, a) => a.findIndex((m) => norm(m) === norm(n)) === i);
  const tampil = (items || []).filter((x) =>
    (!q || norm(x.judul).includes(q) || norm(x.oleh).includes(q)) &&
    (!nama || (nama === "-" ? !x.oleh : norm(x.oleh) === norm(nama))) &&
    (!bulan || (x.dibuat || "").startsWith(bulan)) &&
    (!dari || (x.dibuat || "") >= dari) &&
    (!sampai || (x.dibuat || "").slice(0, 10) <= sampai));
  // entri dengan isi Nama|qty sama persis dengan entri lain (dari seluruh riwayat, bukan hanya yang tampil)
  const jumlahSidik = new Map<string, number>();
  for (const x of items || []) if (x.sidik) jumlahSidik.set(x.sidik, (jumlahSidik.get(x.sidik) || 0) + 1);
  const dobel = (x: Item) => !!x.sidik && (jumlahSidik.get(x.sidik) || 0) > 1;
  const dipilih = tampil.filter((x) => pilih.has(x.id));
  // tanpa centang = semua yang tampil
  const sasaran = dipilih.length ? dipilih : tampil;
  const semuaDicentang = tampil.length > 0 && dipilih.length === tampil.length;

  function keterangan() {
    const f = [
      nama ? `oleh ${nama === "-" ? "(tanpa nama)" : nama}` : "",
      bulan ? `bulan ${bulan}` : "",
      dari || sampai ? `tanggal ${dari || "awal"} s/d ${sampai || "sekarang"}` : "",
      q ? `cari "${cari}"` : "",
    ].filter(Boolean).join(", ");
    return (dipilih.length ? `${dipilih.length} entri dipilih` : `Semua entri yang tampil (${tampil.length})`) + (f ? ` — ${f}` : "");
  }
  async function buatRekap() {
    setBusy(true);
    try {
      const isi = await getRiwayatBanyak(sasaran.map((x) => x.id));
      // urutan mengikuti daftar di layar
      const urut = sasaran.map((x) => isi.find((d: any) => d.id === x.id)).filter(Boolean);
      return { R: rekapRiwayat(urut), ket: keterangan() };
    } catch (e: any) {
      alert(e.message || "Gagal mengambil data riwayat");
      return null;
    } finally {
      setBusy(false);
    }
  }
  async function lihat() {
    const r = await buatRekap();
    if (r) { setRekap(r); setBuka({}); }
  }
  async function exportRekap() {
    const r = await buatRekap();
    if (r) downloadRekapXlsx(r.R, r.ket, ctx.user);
  }
  function centang(id: string) {
    const s = new Set(pilih);
    s.has(id) ? s.delete(id) : s.add(id);
    setPilih(s);
  }

  let grup: string | null = null;
  return (
    <section>
      <div className="card">
        <div className="row" style={{ marginBottom: 10 }}>
          <h2 style={{ margin: 0 }} className="grow">Riwayat Perhitungan</h2>
          <button className="btn" onClick={muat}>Muat ulang</button>
        </div>
        <p className="muted" style={{ margin: "0 0 8px", fontSize: 12 }}>
          <b>Excel</b> = hasil persis seperti saat disimpan. <b>Buka</b> = data input dihitung ulang dengan master harga &amp; mapping terbaru.
          <b> Rekap</b> = gabungan semua entri yang dicentang (tanpa centang = semua yang tampil), memakai hasil seperti saat disimpan.
        </p>
        <div className="row" style={{ marginBottom: 10 }}>
          <input type="text" className="grow" placeholder="cari keterangan..." value={cari} onChange={(e) => setCari(e.target.value)} />
          <select value={nama} onChange={(e) => setNama(e.target.value)} data-testid="filter-nama">
            <option value="">Semua nama</option>
            {daftarNama.map((n) => <option key={n} value={n}>{n}</option>)}
            <option value="-">(tanpa nama)</option>
          </select>
          <label className="muted" style={{ fontSize: 12 }}>bulan <input type="month" value={bulan} onChange={(e) => setBulan(e.target.value)} data-testid="filter-bulan" /></label>
          <label className="muted" style={{ fontSize: 12 }}>dari <input type="date" value={dari} onChange={(e) => setDari(e.target.value)} /></label>
          <label className="muted" style={{ fontSize: 12 }}>sampai <input type="date" value={sampai} onChange={(e) => setSampai(e.target.value)} /></label>
          {(cari || nama || bulan || dari || sampai) && (
            <button className="btn s" onClick={() => { setCari(""); setNama(""); setBulan(""); setDari(""); setSampai(""); }}>reset filter</button>
          )}
        </div>
        <div className="row" style={{ marginBottom: 10, justifyContent: "flex-end" }}>
          <button className="btn" disabled={busy || !sasaran.length} onClick={lihat} data-testid="lihat-rekap">
            Lihat rekap ({sasaran.length})
          </button>
          <button className="btn p" disabled={busy || !sasaran.length} onClick={exportRekap} data-testid="export-rekap">
            {busy ? "Memproses..." : `Export rekap ke Excel (${sasaran.length})`}
          </button>
        </div>
        <div className="scroll">
          <table>
            <thead>
              <tr>
                <th style={{ width: 28 }}>
                  <input type="checkbox" title="pilih semua yang tampil" checked={semuaDicentang}
                    onChange={() => setPilih(semuaDicentang ? new Set() : new Set(tampil.map((x) => x.id)))} />
                </th>
                <th>Keterangan</th><th>Dibuat</th><th>Oleh</th><th className="n">Total pcs</th><th className="n">Total nilai</th><th></th>
              </tr>
            </thead>
            <tbody>
              {items === null && <tr><td colSpan={7} className="muted">Memuat...</td></tr>}
              {items?.length === 0 && <tr><td colSpan={7} className="muted">Belum ada riwayat.</td></tr>}
              {items && items.length > 0 && tampil.length === 0 && <tr><td colSpan={7} className="muted">Tidak ada yang cocok dengan filter.</td></tr>}
              {tampil.map((x) => (
                <tr key={x.id}>
                  <td><input type="checkbox" checked={pilih.has(x.id)} onChange={() => centang(x.id)} /></td>
                  <td>{x.judul}{dobel(x) && <> <span className="tag bad" title="Isi Nama & qty sama persis dengan entri lain — cek supaya rekap tidak dobel">dobel?</span></>}</td><td>{x.dibuat}</td><td>{x.oleh || <span className="muted">(tanpa nama)</span>}</td>
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
              {tampil.length > 0 && (
                <tr className="tot">
                  <td></td><td>Total ({tampil.length} entri tampil)</td><td></td><td></td>
                  <td className="n">{fmt(tampil.reduce((a, x) => a + (x.total_pcs || 0), 0))}</td>
                  <td className="n">{fmt(tampil.reduce((a, x) => a + (x.total_nilai || 0), 0))}</td><td></td>
                </tr>
              )}
            </tbody>
          </table>
        </div>
      </div>

      {rekap && (
        <div className="card" data-testid="rekap">
          <div className="row" style={{ marginBottom: 10 }}>
            <h2 style={{ margin: 0 }} className="grow">Rekap — {rekap.ket}</h2>
            <button className="btn p" onClick={() => downloadRekapXlsx(rekap.R, rekap.ket, ctx.user)}>Export ke Excel</button>
            <button className="btn" onClick={() => setRekap(null)}>Tutup</button>
          </div>
          <div className="stats">
            {[
              ["Jumlah entri", fmt(rekap.R.entri.length)],
              ["Total PCS", fmt(rekap.R.total_pcs)],
              ["Total Nilai (inc PPN)", "Rp " + fmt(rekap.R.total_nilai)],
            ].map(([l, v]) => <div className="stat" key={l}><div className="l">{l}</div><div className="v">{v}</div></div>)}
          </div>
          <p className="muted" style={{ margin: "0 0 8px", fontSize: 12 }}>Klik baris produk untuk melihat rinciannya per keterangan.</p>
          <div className="scroll">
            <table>
              <thead><tr><th>Nama produk</th><th className="n">Total pcs</th><th className="n">Total nilai</th></tr></thead>
              <tbody>
                {rekap.R.produk.map((p) => {
                  const head = p.grup !== grup ? (grup = p.grup, <tr className="grp"><td colSpan={3}>{p.grup || "-"}</td></tr>) : null;
                  return (
                    <Fragment key={p.nama}>
                      {head}
                      <tr className="clk" onClick={() => setBuka({ ...buka, [p.nama]: !buka[p.nama] })}>
                        <td>{buka[p.nama] ? "▾ " : "▸ "}{p.nama}</td>
                        <td className="n">{fmt(p.pcs)}</td>
                        <td className="n">{fmt(p.nilai)}</td>
                      </tr>
                      {buka[p.nama] && rekap.R.entri.filter((e) => p.per[e.id]).map((e) => (
                        <tr className="det" key={e.id}>
                          <td>{e.judul} <span className="muted">({e.dibuat})</span></td>
                          <td className="n">{fmt(p.per[e.id].pcs)}</td>
                          <td className="n">{fmt(p.per[e.id].nilai)}</td>
                        </tr>
                      ))}
                    </Fragment>
                  );
                })}
                <tr className="tot"><td>TOTAL</td><td className="n">{fmt(rekap.R.total_pcs)}</td><td className="n">{fmt(rekap.R.total_nilai)}</td></tr>
              </tbody>
            </table>
          </div>
        </div>
      )}
    </section>
  );
}
