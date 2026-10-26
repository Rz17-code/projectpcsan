import { NextResponse } from "next/server";
import { getStorage } from "@/lib/storage";

export const dynamic = "force-dynamic";

type Ctx = { params: Promise<{ id: string }> };

export async function GET(_req: Request, ctx: Ctx) {
  const { id } = await ctx.params;
  const d = await getStorage().getRiwayat(id);
  return d ? NextResponse.json(d) : NextResponse.json({ error: "tidak ditemukan" }, { status: 404 });
}

export async function PUT(req: Request, ctx: Ctx) {
  try {
    const { id } = await ctx.params;
    const ok = await getStorage().updateRiwayat(id, await req.json());
    return ok ? NextResponse.json({ ok: true }) : NextResponse.json({ error: "tidak ditemukan" }, { status: 404 });
  } catch (e: any) {
    return NextResponse.json({ error: e.message }, { status: 500 });
  }
}

export async function DELETE(_req: Request, ctx: Ctx) {
  const { id } = await ctx.params;
  await getStorage().deleteRiwayat(id);
  return NextResponse.json({ ok: true });
}
