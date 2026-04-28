import { NextResponse } from "next/server";
import { getSession } from "@/lib/auth/middleware";
import {
  fetchTenantTicketDetail,
  updateTenantTicketStatus,
} from "@/lib/api-client";

export const runtime = "nodejs";

export async function GET(
  _req: Request,
  { params }: { params: Promise<{ id: string; ticketId: string }> },
) {
  const session = await getSession();
  if (!session) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }
  const { id, ticketId } = await params;
  const result = await fetchTenantTicketDetail(id, ticketId);
  if (!result.ok) {
    return NextResponse.json({ error: result.error }, { status: 502 });
  }
  return NextResponse.json(result.data);
}

export async function PATCH(
  req: Request,
  { params }: { params: Promise<{ id: string; ticketId: string }> },
) {
  const session = await getSession();
  if (!session) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }
  const { id, ticketId } = await params;
  let body: { status?: string; oldStatus?: string };
  try {
    body = (await req.json()) as { status?: string; oldStatus?: string };
  } catch {
    return NextResponse.json({ error: "Cuerpo inválido" }, { status: 400 });
  }
  if (body.status !== "resolved" && body.status !== "closed") {
    return NextResponse.json(
      { error: "status debe ser 'resolved' o 'closed'" },
      { status: 400 },
    );
  }
  const result = await updateTenantTicketStatus(
    id,
    ticketId,
    body.status,
    body.oldStatus,
  );
  if (!result.ok) {
    return NextResponse.json({ error: result.error }, { status: 502 });
  }
  return NextResponse.json({ ok: true });
}
