import { NextResponse } from "next/server";
import { getSession } from "@/lib/auth/middleware";
import { fetchTenantBrandingAudit } from "@/lib/api-client";

export const runtime = "nodejs";

export async function GET(
  req: Request,
  { params }: { params: Promise<{ id: string }> },
) {
  const session = await getSession();
  if (!session) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }
  const { id } = await params;
  const sp = new URL(req.url).searchParams;
  const limit = Math.min(
    Math.max(parseInt(sp.get("limit") ?? "50", 10) || 50, 1),
    200,
  );
  const result = await fetchTenantBrandingAudit(id, limit);
  if (!result.ok) {
    return NextResponse.json({ error: result.error }, { status: 502 });
  }
  return NextResponse.json({ events: result.events });
}
