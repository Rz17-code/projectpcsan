import { NextResponse } from "next/server";
import { getStorage } from "@/lib/storage";

export const dynamic = "force-dynamic";

export async function GET() {
  try {
    return NextResponse.json(await getStorage().getMaster());
  } catch (e: any) {
    return NextResponse.json({ error: e.message }, { status: 500 });
  }
}

export async function POST(req: Request) {
  try {
    const body = await req.json();
    if (!Array.isArray(body.produk) || !Array.isArray(body.mapping)) {
      return NextResponse.json({ error: "data tidak valid" }, { status: 400 });
    }
    const r = await getStorage().saveMaster(body.versi, { produk: body.produk, mapping: body.mapping }, String(body.oleh || ""));
    if (!r.ok) {
      return NextResponse.json(
        { error: "konflik", pesan: "Master sudah diubah orang lain. Data terbaru dimuat ulang — silakan ulangi perubahan Anda.", master: r.master },
        { status: 409 },
      );
    }
    return NextResponse.json(r.master);
  } catch (e: any) {
    return NextResponse.json({ error: e.message }, { status: 500 });
  }
}
