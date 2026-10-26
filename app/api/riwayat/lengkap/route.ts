import { NextResponse } from "next/server";
import { getStorage } from "@/lib/storage";

export const dynamic = "force-dynamic";

/** Isi lengkap beberapa riwayat sekaligus (untuk rekap). Body: { ids: string[] } */
export async function POST(req: Request) {
  try {
    const { ids } = await req.json();
    if (!Array.isArray(ids) || ids.length > 1000) return NextResponse.json({ error: "ids tidak valid" }, { status: 400 });
    return NextResponse.json(await getStorage().getRiwayatBanyak(ids.map(String)));
  } catch (e: any) {
    return NextResponse.json({ error: e.message }, { status: 500 });
  }
}
