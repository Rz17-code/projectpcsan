"use client";
import { useState } from "react";

export default function Login() {
  const [pw, setPw] = useState("");
  const [err, setErr] = useState("");
  const [busy, setBusy] = useState(false);

  async function masuk(e: React.FormEvent) {
    e.preventDefault();
    setBusy(true);
    setErr("");
    const r = await fetch("/api/login", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ password: pw }) });
    if (r.ok) { location.href = "/"; return; }
    setErr((await r.json().catch(() => ({}))).error || "Gagal masuk.");
    setBusy(false);
  }

  return (
    <>
      <header>
        <div>
          <h1>PCSAN OTOMATIS</h1>
          <div className="sub">Hitung pcs × harga jual per pcs (inc PPN), bundling dipecah otomatis</div>
        </div>
      </header>
      <main>
        <form className="card" style={{ maxWidth: 380, margin: "40px auto" }} onSubmit={masuk}>
          <h2>Masuk</h2>
          <input type="password" autoFocus placeholder="Password" value={pw} onChange={(e) => setPw(e.target.value)}
            style={{ width: "100%", marginBottom: 10 }} />
          {err && <div className="msg bad">{err}</div>}
          <button className="btn p" type="submit" disabled={busy || !pw} style={{ width: "100%" }}>{busy ? "Memeriksa..." : "Masuk"}</button>
        </form>
      </main>
    </>
  );
}
