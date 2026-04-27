import { NextResponse } from "next/server";
import { getSession } from "@/lib/auth/middleware";
import { tenantApi } from "@/lib/api-client";

export const runtime = "nodejs";

export async function POST(
  _req: Request,
  { params }: { params: Promise<{ id: string; backupId: string }> },
) {
  const session = await getSession();
  if (!session) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }
  const { id, backupId } = await params;
  const result = await tenantApi.backups.restore(id, backupId);
  if (!result.ok) {
    return NextResponse.json(
      { error: result.error },
      { status: result.status || 502 },
    );
  }
  return NextResponse.json(result.data ?? { ok: true });
}
