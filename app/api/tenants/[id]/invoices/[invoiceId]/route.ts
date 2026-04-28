import { NextResponse } from "next/server";
import { getSession } from "@/lib/auth/middleware";
import { prisma } from "@/lib/db";
import { invoiceUpdateSchema } from "@/lib/validation/invoice";
import { pushInvoiceToTenant } from "@/lib/invoices";
import { tenantApi } from "@/lib/api-client";

export const runtime = "nodejs";

export async function PATCH(
  req: Request,
  { params }: { params: Promise<{ id: string; invoiceId: string }> },
) {
  const session = await getSession();
  if (!session) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  const { id: tenantId, invoiceId } = await params;

  let body: ReturnType<typeof invoiceUpdateSchema.parse>;
  try {
    body = invoiceUpdateSchema.parse(await req.json());
  } catch (e) {
    return NextResponse.json(
      { error: "Cuerpo inválido", detail: (e as Error).message },
      { status: 400 },
    );
  }

  const inv = await prisma.invoice.findFirst({
    where: { id: invoiceId, tenantId },
  });
  if (!inv) return NextResponse.json({ error: "Factura no encontrada" }, { status: 404 });

  const data: Record<string, unknown> = {};
  if (body.amountCents !== undefined) data.amountCents = body.amountCents;
  if (body.status !== undefined) data.status = body.status;
  if (body.dueDate !== undefined) data.dueDate = body.dueDate;
  if (body.paidAt !== undefined) data.paidAt = body.paidAt;
  if (body.paymentMethod !== undefined) data.paymentMethod = body.paymentMethod;
  if (body.paymentReference !== undefined) data.paymentReference = body.paymentReference;
  if (body.notes !== undefined) data.notes = body.notes;

  // Si pasa a paid sin paidAt explícito, lo seteamos a ahora.
  if (body.status === "paid" && body.paidAt === undefined && !inv.paidAt) {
    data.paidAt = new Date();
  }
  // Si pasa a pending, limpiamos paidAt.
  if (body.status === "pending") {
    data.paidAt = null;
    data.paymentMethod = null;
    data.paymentReference = null;
  }

  const updated = await prisma.invoice.update({
    where: { id: invoiceId },
    data,
  });

  // Si se marca como paid, registramos también un Payment del tipo "monthly".
  if (
    body.status === "paid" &&
    inv.status !== "paid"
  ) {
    await prisma.payment.create({
      data: {
        tenantId,
        amount: updated.amountCents,
        type: "monthly",
        paidAt: updated.paidAt ?? new Date(),
        method: updated.paymentMethod ?? null,
        reference: updated.paymentReference ?? null,
        notes: `Factura ${updated.number}`,
      },
    });
  }

  await pushInvoiceToTenant(updated.id).catch(() => null);

  await prisma.operationLog.create({
    data: {
      tenantId,
      action: "invoice.update",
      status: "success",
      details: {
        invoiceId: updated.id,
        number: updated.number,
        statusBefore: inv.status,
        statusAfter: updated.status,
      },
    },
  });

  return NextResponse.json({ invoice: updated });
}

export async function DELETE(
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

  // Borra en cliente best-effort
  await tenantApi.invoices.delete(tenantId, inv.number).catch(() => null);

  await prisma.invoice.delete({ where: { id: invoiceId } });

  await prisma.operationLog.create({
    data: {
      tenantId,
      action: "invoice.delete",
      status: "success",
      details: { invoiceId, number: inv.number },
    },
  });

  return NextResponse.json({ ok: true });
}
