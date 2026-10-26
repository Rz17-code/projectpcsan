import { NextResponse } from "next/server";
import { COOKIE, tokenDari } from "@/lib/auth";

export const dynamic = "force-dynamic";

export async function POST(req: Request) {
  const pw = process.env.PCSAN_PASSWORD;
  if (!pw) return NextResponse.json({ ok: true });
  const { password } = await req.json().catch(() => ({ password: "" }));
  if (String(password ?? "") !== pw) {
    await new Promise((r) => setTimeout(r, 800)); // memperlambat tebak-tebakan password
    return NextResponse.json({ error: "Password salah." }, { status: 401 });
  }
  const res = NextResponse.json({ ok: true });
  res.cookies.set(COOKIE, await tokenDari(pw), {
    httpOnly: true, sameSite: "lax", path: "/", maxAge: 60 * 60 * 24 * 30,
    secure: new URL(req.url).protocol === "https:",
  });
  return res;
}

export async function DELETE() {
  const res = NextResponse.json({ ok: true });
  res.cookies.delete(COOKIE);
  return res;
}
