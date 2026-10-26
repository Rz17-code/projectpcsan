// Lapisan penyimpanan data PCSAN.
// Semua API route HANYA memakai fungsi di file ini, jadi saat pindah ke Vercel
// cukup tambahkan adapter database baru di sini (lihat README: "Deploy ke Vercel").
import "server-only";
import fs from "node:fs/promises";
import path from "node:path";
import crypto from "node:crypto";
import type { Master } from "./pcsan";

export type RiwayatRingkas = { id: string; judul: string; dibuat: string; oleh: string; total_pcs: number; total_nilai: number };

export interface Storage {
  getMaster(): Promise<Master>;
  /** Simpan master. Gagal (konflik) bila versiLama != versi saat ini. */
  saveMaster(versiLama: number, data: Pick<Master, "produk" | "mapping">, oleh: string): Promise<{ ok: true; master: Master } | { ok: false; master: Master }>;
  listRiwayat(): Promise<RiwayatRingkas[]>;
  getRiwayat(id: string): Promise<any | null>;
  addRiwayat(data: any): Promise<string>;
  deleteRiwayat(id: string): Promise<void>;
}

const now = () => {
  const d = new Date();
  const p = (n: number) => String(n).padStart(2, "0");
  return `${d.getFullYear()}-${p(d.getMonth() + 1)}-${p(d.getDate())} ${p(d.getHours())}:${p(d.getMinutes())}:${p(d.getSeconds())}`;
};

// ------------------------------------------------------------------ adapter: file lokal (folder ./data)
class FileStorage implements Storage {
  dir = path.join(process.cwd(), "data");
  masterFile = path.join(this.dir, "master.json");
  backupDir = path.join(this.dir, "backup");
  riwayatDir = path.join(this.dir, "riwayat");
  private lock: Promise<unknown> = Promise.resolve();

  private async init() {
    await fs.mkdir(this.backupDir, { recursive: true });
    await fs.mkdir(this.riwayatDir, { recursive: true });
    try { await fs.access(this.masterFile); }
    catch { await fs.copyFile(path.join(process.cwd(), "data-awal", "master.json"), this.masterFile); }
  }
  private serial<T>(fn: () => Promise<T>): Promise<T> {
    const run = this.lock.then(fn, fn);
    this.lock = run.catch(() => undefined);
    return run;
  }
  async getMaster() {
    await this.init();
    return JSON.parse(await fs.readFile(this.masterFile, "utf8")) as Master;
  }
  saveMaster(versiLama: number, data: Pick<Master, "produk" | "mapping">, oleh: string) {
    return this.serial(async () => {
      const cur = await this.getMaster();
      if (versiLama !== cur.versi) return { ok: false as const, master: cur };
      const stamp = now().replace(/[-: ]/g, "");
      await fs.copyFile(this.masterFile, path.join(this.backupDir, `master_${stamp}.json`));
      const files = (await fs.readdir(this.backupDir)).sort();
      for (const old of files.slice(0, -100)) await fs.rm(path.join(this.backupDir, old), { force: true });
      const master: Master = { versi: (cur.versi || 0) + 1, produk: data.produk, mapping: data.mapping, diubah: now(), oleh };
      const tmp = this.masterFile + ".tmp";
      await fs.writeFile(tmp, JSON.stringify(master, null, 1), "utf8");
      await fs.rename(tmp, this.masterFile);
      return { ok: true as const, master };
    });
  }
  async listRiwayat() {
    await this.init();
    const out: RiwayatRingkas[] = [];
    for (const f of await fs.readdir(this.riwayatDir)) {
      if (!f.endsWith(".json")) continue;
      try {
        const d = JSON.parse(await fs.readFile(path.join(this.riwayatDir, f), "utf8"));
        out.push({ id: d.id, judul: d.judul, dibuat: d.dibuat, oleh: d.oleh, total_pcs: d.total_pcs, total_nilai: d.total_nilai });
      } catch { /* abaikan file rusak */ }
    }
    return out.sort((a, b) => (b.dibuat || "").localeCompare(a.dibuat || ""));
  }
  private safeId(id: string) { return /^[A-Za-z0-9_-]+$/.test(id) ? id : null; }
  async getRiwayat(id: string) {
    await this.init();
    const s = this.safeId(id); if (!s) return null;
    try { return JSON.parse(await fs.readFile(path.join(this.riwayatDir, s + ".json"), "utf8")); } catch { return null; }
  }
  async addRiwayat(data: any) {
    await this.init();
    const id = now().replace(/[-: ]/g, "") + "_" + crypto.randomBytes(3).toString("hex");
    await fs.writeFile(path.join(this.riwayatDir, id + ".json"), JSON.stringify({ ...data, id, dibuat: now() }), "utf8");
    return id;
  }
  async deleteRiwayat(id: string) {
    const s = this.safeId(id); if (!s) return;
    await fs.rm(path.join(this.riwayatDir, s + ".json"), { force: true });
  }
}

// ------------------------------------------------------------------ pemilih adapter
let instance: Storage | null = null;
export function getStorage(): Storage {
  if (instance) return instance;
  const mode = process.env.PCSAN_STORAGE || "file";
  if (mode === "file") {
    if (process.env.VERCEL) {
      throw new Error("Mode penyimpanan 'file' tidak bisa dipakai di Vercel (folder tidak permanen). Hubungkan database dulu — lihat README bagian 'Deploy ke Vercel'.");
    }
    instance = new FileStorage();
    return instance;
  }
  // Tempat adapter database cloud nanti, contoh:
  // if (mode === "supabase") { instance = new SupabaseStorage(); return instance; }
  throw new Error(`PCSAN_STORAGE='${mode}' belum didukung.`);
}
