// Panggilan ke API server dari browser.
import type { Master } from "./pcsan";

export async function fetchMaster(): Promise<Master> {
  const r = await fetch("/api/master", { cache: "no-store" });
  const d = await r.json();
  if (!r.ok) throw new Error(d.error || "Gagal memuat master");
  return d;
}

/** Hasil: master terbaru. Bila konflik, kembalikan master terbaru + pesan. */
export async function postMaster(m: Master, oleh: string): Promise<{ ok: boolean; master?: Master; pesan?: string }> {
  const r = await fetch("/api/master", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ versi: m.versi, produk: m.produk, mapping: m.mapping, oleh }),
  });
  const d = await r.json();
  if (r.status === 409) return { ok: false, master: d.master, pesan: d.pesan };
  if (!r.ok) return { ok: false, pesan: "Gagal menyimpan: " + (d.error || r.status) };
  return { ok: true, master: d };
}

export async function listRiwayat() {
  const r = await fetch("/api/riwayat", { cache: "no-store" });
  return r.json();
}
export async function getRiwayat(id: string) {
  const r = await fetch("/api/riwayat/" + id, { cache: "no-store" });
  return r.json();
}
/** Simpan riwayat: perbarui entri `id` bila ada, kalau tidak (atau sudah dihapus) buat baru. Hasil: id, atau null bila gagal. */
export async function simpanRiwayat(id: string | null, data: unknown): Promise<string | null> {
  const body = JSON.stringify(data);
  const headers = { "Content-Type": "application/json" };
  if (id) {
    const r = await fetch("/api/riwayat/" + id, { method: "PUT", headers, body });
    if (r.ok) return id;
    if (r.status !== 404) return null;
  }
  const r = await fetch("/api/riwayat", { method: "POST", headers, body });
  return r.ok ? (await r.json()).id : null;
}
export async function deleteRiwayat(id: string) {
  await fetch("/api/riwayat/" + id, { method: "DELETE" });
}
export async function getRiwayatBanyak(ids: string[]) {
  const r = await fetch("/api/riwayat/lengkap", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ ids }) });
  if (!r.ok) throw new Error("Gagal mengambil data riwayat");
  return r.json();
}
