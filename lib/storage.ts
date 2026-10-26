// Lapisan penyimpanan data PCSAN.
// Semua API route HANYA memakai fungsi di file ini, jadi saat pindah ke Vercel
// cukup tambahkan adapter database baru di sini (lihat README: "Deploy ke Vercel").
import "server-only";
import fs from "node:fs/promises";
import path from "node:path";
import crypto from "node:crypto";
import { Redis } from "@upstash/redis";
import type { Master } from "./pcsan";
import seed from "@/data-awal/master.json";

export type RiwayatRingkas = { id: string; judul: string; dibuat: string; oleh: string; total_pcs: number; total_nilai: number };

export interface Storage {
  getMaster(): Promise<Master>;
  /** Simpan master. Gagal (konflik) bila versiLama != versi saat ini. */
  saveMaster(versiLama: number, data: Pick<Master, "produk" | "mapping">, oleh: string): Promise<{ ok: true; master: Master } | { ok: false; master: Master }>;
  listRiwayat(): Promise<RiwayatRingkas[]>;
  getRiwayat(id: string): Promise<any | null>;
  addRiwayat(data: any): Promise<string>;
  /** Perbarui riwayat yang sudah ada (tanggal dibuat dipertahankan). false = tidak ditemukan. */
  updateRiwayat(id: string, data: any): Promise<boolean>;
  deleteRiwayat(id: string): Promise<void>;
}

const ringkasan = (d: any): RiwayatRingkas =>
  ({ id: d.id, judul: d.judul, dibuat: d.dibuat, oleh: d.oleh, total_pcs: d.total_pcs, total_nilai: d.total_nilai });

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
        out.push(ringkasan(d));
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
  async updateRiwayat(id: string, data: any) {
    const lama = await this.getRiwayat(id);
    if (!lama) return false;
    await fs.writeFile(path.join(this.riwayatDir, lama.id + ".json"), JSON.stringify({ ...data, id: lama.id, dibuat: lama.dibuat, diubah: now() }), "utf8");
    return true;
  }
  async deleteRiwayat(id: string) {
    const s = this.safeId(id); if (!s) return;
    await fs.rm(path.join(this.riwayatDir, s + ".json"), { force: true });
  }
}

// ------------------------------------------------------------------ adapter: Upstash Redis (untuk Vercel)
// Kunci koneksi diisi otomatis oleh integrasi "Upstash for Redis" di Vercel (KV_REST_API_* atau UPSTASH_REDIS_REST_*).
const redisUrl = () => process.env.KV_REST_API_URL || process.env.UPSTASH_REDIS_REST_URL;
const redisToken = () => process.env.KV_REST_API_TOKEN || process.env.UPSTASH_REDIS_REST_TOKEN;

const K = {
  master: "pcsan:master",
  versi: "pcsan:master:versi",
  backup: "pcsan:master:backup", // list, terbaru di depan, maks 100
  ringkas: "pcsan:riwayat", // hash id -> ringkasan (untuk daftar)
  riwayat: (id: string) => "pcsan:riwayat:" + id,
};

// Cek versi + backup + simpan dalam satu langkah atomik, supaya dua orang yang menyimpan bersamaan tidak saling menimpa.
const LUA_SIMPAN = `
if redis.call('GET', KEYS[1]) ~= ARGV[1] then return 0 end
local lama = redis.call('GET', KEYS[2])
if lama then redis.call('LPUSH', KEYS[3], lama); redis.call('LTRIM', KEYS[3], 0, 99) end
redis.call('SET', KEYS[2], ARGV[3])
redis.call('SET', KEYS[1], ARGV[2])
return 1`;

class RedisStorage implements Storage {
  // automaticDeserialization: false -> semua nilai string mentah, JSON diurus sendiri
  r = new Redis({ url: redisUrl()!, token: redisToken()!, automaticDeserialization: false });

  async getMaster() {
    const s = await this.r.get<string>(K.master);
    if (s) return JSON.parse(s) as Master;
    // pertama kali: isi dari master awal (NX = tidak menimpa bila ada yang sudah mengisi duluan)
    const awal = seed as unknown as Master;
    await this.r.set(K.master, JSON.stringify(awal), { nx: true });
    await this.r.set(K.versi, String(awal.versi), { nx: true });
    return JSON.parse((await this.r.get<string>(K.master))!) as Master;
  }
  async saveMaster(versiLama: number, data: Pick<Master, "produk" | "mapping">, oleh: string) {
    const cur = await this.getMaster();
    const master: Master = { versi: (cur.versi || 0) + 1, produk: data.produk, mapping: data.mapping, diubah: now(), oleh };
    const ok = await this.r.eval<string[], number>(LUA_SIMPAN, [K.versi, K.master, K.backup], [String(versiLama), String(master.versi), JSON.stringify(master)]);
    return Number(ok) === 1 ? { ok: true as const, master } : { ok: false as const, master: await this.getMaster() };
  }
  async listRiwayat() {
    const h = (await this.r.hgetall<Record<string, string>>(K.ringkas)) || {};
    const out: RiwayatRingkas[] = [];
    for (const v of Object.values(h)) { try { out.push(JSON.parse(v)); } catch { /* abaikan data rusak */ } }
    return out.sort((a, b) => (b.dibuat || "").localeCompare(a.dibuat || ""));
  }
  async getRiwayat(id: string) {
    const s = await this.r.get<string>(K.riwayat(id));
    return s ? JSON.parse(s) : null;
  }
  async addRiwayat(data: any) {
    const id = now().replace(/[-: ]/g, "") + "_" + crypto.randomBytes(3).toString("hex");
    await this.tulisRiwayat({ ...data, id, dibuat: now() });
    return id;
  }
  async updateRiwayat(id: string, data: any) {
    const lama = await this.getRiwayat(id);
    if (!lama) return false;
    await this.tulisRiwayat({ ...data, id, dibuat: lama.dibuat, diubah: now() });
    return true;
  }
  private async tulisRiwayat(d: any) {
    await this.r.set(K.riwayat(d.id), JSON.stringify(d));
    await this.r.hset(K.ringkas, { [d.id]: JSON.stringify(ringkasan(d)) });
  }
  async deleteRiwayat(id: string) {
    await this.r.hdel(K.ringkas, id);
    await this.r.del(K.riwayat(id));
  }
}

// ------------------------------------------------------------------ pemilih adapter
let instance: Storage | null = null;
export function getStorage(): Storage {
  if (instance) return instance;
  const adaRedis = !!(redisUrl() && redisToken());
  // di Vercel, Redis yang sudah terhubung otomatis dipakai walau PCSAN_STORAGE masih "file"
  const mode = (process.env.VERCEL && adaRedis ? "" : process.env.PCSAN_STORAGE) || (adaRedis ? "redis" : "file");
  if (mode === "redis") {
    if (!adaRedis) throw new Error("PCSAN_STORAGE='redis' tapi kunci Upstash Redis (KV_REST_API_URL / KV_REST_API_TOKEN) belum ada.");
    instance = new RedisStorage();
    return instance;
  }
  if (mode === "file") {
    if (process.env.VERCEL) {
      throw new Error("Database belum terhubung. Di Vercel buka project → Storage → hubungkan Upstash for Redis, lalu Redeploy (lihat README bagian 'Deploy ke Vercel').");
    }
    instance = new FileStorage();
    return instance;
  }
  throw new Error(`PCSAN_STORAGE='${mode}' belum didukung.`);
}
