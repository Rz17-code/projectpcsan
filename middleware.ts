import { NextResponse, type NextRequest } from "next/server";
import { COOKIE, tokenDari } from "@/lib/auth";

export async function middleware(req: NextRequest) {
  const pw = process.env.PCSAN_PASSWORD;
  if (!pw) return NextResponse.next();
  if (req.cookies.get(COOKIE)?.value === (await tokenDari(pw))) return NextResponse.next();
  if (req.nextUrl.pathname.startsWith("/api/")) {
    return NextResponse.json({ error: "Belum login. Muat ulang halaman lalu masukkan password." }, { status: 401 });
  }
  return NextResponse.redirect(new URL("/login", req.url));
}

export const config = {
  // semua halaman & API kecuali halaman login, API login, dan file statis Next.js
  matcher: ["/((?!login|api/login|_next/static|_next/image|favicon.ico).*)"],
};
