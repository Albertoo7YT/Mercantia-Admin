import { NextResponse } from "next/server";
import { getSession } from "@/lib/auth/middleware";
import { getTenantActionLogs } from "@/lib/api-client";

export const runtime = "nodejs";

export async function GET(
  req: Request,
  { params }: { params: Promise<{ id: string; actionId: string }> },
) {
  const session = await getSession();
  if (!session) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }
  const { id, actionId } = await params;
  const sp = new URL(req.url).searchParams;
  const fromLineRaw = sp.get("fromLine");
  const maxLinesRaw = sp.get("maxLines");
  const fromLine =
    fromLineRaw !== null ? Math.max(parseInt(fromLineRaw, 10) || 0, 0) : undefined;
  const maxLines =
    maxLinesRaw !== null
      ? Math.min(Math.max(parseInt(maxLinesRaw, 10) || 1000, 1), 5000)
      : undefined;

  const result = await getTenantActionLogs(id, actionId, { fromLine, maxLines });
  if (!result.ok) {
    return NextResponse.json({ error: result.error }, { status: 502 });
  }
  return NextResponse.json(result.data);
}
