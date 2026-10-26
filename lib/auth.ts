// Password bersama (opsional). Aktif hanya bila env PCSAN_PASSWORD diisi — di localhost biasanya kosong = tanpa password.
// Cookie berisi hash dari password, jadi mengganti PCSAN_PASSWORD otomatis mengeluarkan semua yang sudah login.

export const COOKIE = "pcsan_auth";

export async function tokenDari(password: string): Promise<string> {
  const buf = await crypto.subtle.digest("SHA-256", new TextEncoder().encode("pcsan:" + password));
  return [...new Uint8Array(buf)].map((b) => b.toString(16).padStart(2, "0")).join("");
}
