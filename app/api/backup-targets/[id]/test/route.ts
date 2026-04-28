import { NextResponse } from "next/server";
import { getSession } from "@/lib/auth/middleware";
import { prisma } from "@/lib/db";
import { testSshConnection } from "@/lib/ssh";

export const runtime = "nodejs";

export async function POST(
  _req: Request,
  { params }: { params: Promise<{ id: string }> },
) {
  const session = await getSession();
  if (!session) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }
  const { id } = await params;
  const target = await prisma.backupTarget.findUnique({ where: { id } });
  if (!target) {
    return NextResponse.json({ error: "Target no encontrado" }, { status: 404 });
  }

  const result = await testSshConnection({
    host: target.host,
    port: target.port,
    username: target.username,
    sshKeyPath: target.sshKeyPath,
  });

  await prisma.operationLog.create({
    data: {
      action: "backup-target.test",
      status: result.ok ? "success" : "error",
      details: {
        targetId: id,
        host: target.host,
        durationMs: result.durationMs,
      },
      errorMessage: result.ok ? null : result.error,
    },
  });

  return NextResponse.json(result, { status: result.ok ? 200 : 502 });
}
