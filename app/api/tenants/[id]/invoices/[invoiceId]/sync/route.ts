import { NextResponse } from "next/server";
import { getSession } from "@/lib/auth/middleware";
import { prisma } from "@/lib/db";
import { pushInvoiceToTenant } from "@/lib/invoices";

export const runtime = "nodejs";

/**
 * Reintenta el push de una factura al cliente. Útil cuando el cliente
 * estaba caído y syncStatus=error.
 */
export async function POST(
  _req: Request,
  { params }: { params: Promise<{ id: string; invoiceId: string }> },
) {
  const session = await getSession();
  if (!session) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  const { id: tenantId, invoiceId } = await params;

  const inv = await prisma.invoice.findFirst({
    where: { id: invoiceId, tenantId },
  });
  if (!inv) return NextResponse.json({ error: "Factura no encontrada" }, { status: 404 });

  const r = await pushInvoiceToTenant(invoiceId);
  if (!r.ok) {
    return NextResponse.json({ ok: false, error: r.error }, { status: 502 });
  }
  return NextResponse.json({ ok: true });
}
