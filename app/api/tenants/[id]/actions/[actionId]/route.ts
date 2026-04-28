import { NextResponse } from "next/server";
import { getSession } from "@/lib/auth/middleware";
import { getTenantActionStatus } from "@/lib/api-client";

export const runtime = "nodejs";

export async function GET(
  _req: Request,
  { params }: { params: Promise<{ id: string; actionId: string }> },
) {
  const session = await getSession();
  if (!session) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }
  const { id, actionId } = await params;
  const result = await getTenantActionStatus(id, actionId);
  if (!result.ok) {
    return NextResponse.json({ error: result.error }, { status: 502 });
  }
  return NextResponse.json(result.action);
}
