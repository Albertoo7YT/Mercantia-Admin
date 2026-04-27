import { NextResponse } from "next/server";
import { prisma } from "@/lib/db";
import { getSession } from "@/lib/auth/middleware";

export const runtime = "nodejs";

export async function DELETE(
  _req: Request,
  { params }: { params: Promise<{ id: string }> },
) {
  const session = await getSession();
  if (!session) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  const { id } = await params;

  const existing = await prisma.tenant.findUnique({ where: { id } });
  if (!existing) {
    return NextResponse.json({ error: "Not found" }, { status: 404 });
  }

  await prisma.tenant.update({
    where: { id },
    data: { status: "suspended" },
  });
  await prisma.operationLog.create({
    data: {
      tenantId: id,
      action: "tenant.suspend",
      status: "success",
    },
  });

  return NextResponse.json({ ok: true, status: "suspended" });
}
