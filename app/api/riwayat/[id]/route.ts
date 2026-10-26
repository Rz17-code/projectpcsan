import { NextResponse } from "next/server";
import { getStorage } from "@/lib/storage";

export const dynamic = "force-dynamic";

type Ctx = { params: Promise<{ id: string }> };

export async function GET(_req: Request, ctx: Ctx) {
  const { id } = await ctx.params;
  const d = await getStorage().getRiwayat(id);
  return d ? NextResponse.json(d) : NextResponse.json({ error: "tidak ditemukan" }, { status: 404 });
}

export async function DELETE(_req: Request, ctx: Ctx) {
  const { id } = await ctx.params;
  await getStorage().deleteRiwayat(id);
  return NextResponse.json({ ok: true });
}
