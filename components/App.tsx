"use client";
import { useCallback, useEffect, useRef, useState } from "react";
import type { InputRow, Master } from "@/lib/pcsan";
import { fetchMaster, postMaster } from "@/lib/api";
import Hitung from "./Hitung";
import MasterHarga from "./MasterHarga";
import MappingTab from "./MappingTab";
import Riwayat from "./Riwayat";
import MappingModal from "./MappingModal";

export type DataInput = { input: InputRow[]; totalFile: number | null; sumber: string; judul: string };
export type ModalState = { idx: number | null; nama: string } | null;

export type Ctx = {
  master: Master;
  user: string;
  simpanMaster: (m: Master) => Promise<boolean>;
  toast: (t: string) => void;
  bukaMapping: (idx: number | null, nama?: string) => void;
};

const TABS = [
  ["hitung", "Hitung PCSAN"],
  ["harga", "Master Harga"],
  ["mapping", "Mapping Bundling"],
  ["riwayat", "Riwayat"],
] as const;
type Tab = (typeof TABS)[number][0];

export default function App() {
  const [master, setMaster] = useState<Master | null>(null);
  const [err, setErr] = useState("");
  const [tab, setTab] = useState<Tab>("hitung");
  const [user, setUser] = useState("");
  const [data, setData] = useState<DataInput>({ input: [], totalFile: null, sumber: "", judul: "" });
  const [modal, setModal] = useState<ModalState>(null);
  const [toastMsg, setToastMsg] = useState("");
  const toastTimer = useRef<ReturnType<typeof setTimeout> | undefined>(undefined);

  useEffect(() => {
    try { setUser(localStorage.getItem("pcsan_user") || ""); } catch {}
    fetchMaster().then(setMaster).catch((e) => setErr(e.message || "Tidak bisa terhubung ke server PCSAN."));
  }, []);

  const toast = useCallback((t: string) => {
    setToastMsg(t);
    clearTimeout(toastTimer.current);
    toastTimer.current = setTimeout(() => setToastMsg(""), 2600);
  }, []);

  const simpanMaster = useCallback(async (m: Master) => {
    const r = await postMaster(m, user);
    if (r.master) setMaster(r.master);
    if (!r.ok) { alert(r.pesan); return false; }
    return true;
  }, [user]);

  if (err) return <main><div className="msg bad">{err}</div></main>;
  if (!master) return <main><p className="muted">Memuat data...</p></main>;

  const ctx: Ctx = { master, user, simpanMaster, toast, bukaMapping: (idx, nama = "") => setModal({ idx, nama }) };

  return (
    <>
      <header>
        <div>
          <h1>PCSAN OTOMATIS</h1>
          <div className="sub">Hitung pcs × harga jual per pcs (inc PPN), bundling dipecah otomatis</div>
        </div>
        <div className="user">
          Nama Anda:{" "}
          <input
            type="text" placeholder="isi nama" value={user}
            onChange={(e) => { setUser(e.target.value); try { localStorage.setItem("pcsan_user", e.target.value); } catch {} }}
          />
        </div>
      </header>
      <nav>
        {TABS.map(([k, l]) => (
          <button key={k} className={tab === k ? "on" : ""} onClick={() => setTab(k)}>{l}</button>
        ))}
      </nav>
      <main>
        {tab === "hitung" && <Hitung ctx={ctx} data={data} setData={setData} />}
        {tab === "harga" && <MasterHarga ctx={ctx} />}
        {tab === "mapping" && <MappingTab ctx={ctx} />}
        {tab === "riwayat" && (
          <Riwayat ctx={ctx} onBuka={(d) => { setData(d); setTab("hitung"); toast("Dihitung ulang dengan master harga & mapping saat ini"); }} />
        )}
      </main>
      {modal && <MappingModal ctx={ctx} state={modal} onClose={() => setModal(null)} />}
      <div className={"toast" + (toastMsg ? " on" : "")}>{toastMsg}</div>
    </>
  );
}
