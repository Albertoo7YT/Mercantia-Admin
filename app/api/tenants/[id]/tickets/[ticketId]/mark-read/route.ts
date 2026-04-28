import { NextResponse } from "next/server";
import { getSession } from "@/lib/auth/middleware";
import { markTenantTicketRead } from "@/lib/api-client";

export const runtime = "nodejs";

export async function POST(
  _req: Request,
  { params }: { params: Promise<{ id: string; ticketId: string }> },
) {
  const session = await getSession();
  if (!session) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }
  const { id, ticketId } = await params;
  const result = await markTenantTicketRead(id, ticketId);
  if (!result.ok) {
    return NextResponse.json({ error: result.error }, { status: 502 });
  }
  return NextResponse.json({ ok: true });
}
