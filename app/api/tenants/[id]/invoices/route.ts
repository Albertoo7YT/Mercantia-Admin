import { NextResponse } from "next/server";
import { getSession } from "@/lib/auth/middleware";
import { prisma } from "@/lib/db";
import { invoiceCreateSchema } from "@/lib/validation/invoice";
import {
  buildInvoiceNumber,
  pushInvoiceToTenant,
} from "@/lib/invoices";

export const runtime = "nodejs";

export async function GET(
  _req: Request,
  { params }: { params: Promise<{ id: string }> },
) {
  const session = await getSession();
  if (!session) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  const { id } = await params;

  const invoices = await prisma.invoice.findMany({
    where: { tenantId: id },
    orderBy: [{ periodMonth: "desc" }, { createdAt: "desc" }],
  });
  return NextResponse.json({ invoices });
}

export async function POST(
  req: Request,
  { params }: { params: Promise<{ id: string }> },
) {
  const session = await getSession();
  if (!session) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  const { id: tenantId } = await params;

  let body: ReturnType<typeof invoiceCreateSchema.parse>;
  try {
    body = invoiceCreateSchema.parse(await req.json());
  } catch (e) {
    return NextResponse.json(
      { error: "Cuerpo inválido", detail: (e as Error).message },
      { status: 400 },
    );
  }

  const tenant = await prisma.tenant.findUnique({ where: { id: tenantId } });
  if (!tenant) return NextResponse.json({ error: "Tenant no encontrado" }, { status: 404 });

  // Si ya hay factura para ese periodMonth, devolvemos 409.
  const existing = await prisma.invoice.findUnique({
    where: { tenantId_periodMonth: { tenantId, periodMonth: body.periodMonth } },
  });
  if (existing) {
    return NextResponse.json(
      { error: "Ya existe una factura para ese periodo", invoiceId: existing.id },
      { status: 409 },
    );
  }

  const number = buildInvoiceNumber(body.periodMonth, tenant.slug);
  const created = await prisma.invoice.create({
    data: {
      tenantId,
      number,
      periodMonth: body.periodMonth,
      amountCents: body.amountCents,
      status: body.status,
      dueDate: body.dueDate,
      paidAt: body.paidAt,
      paymentMethod: body.paymentMethod,
      paymentReference: body.paymentReference,
      notes: body.notes,
    },
  });

  // Push best-effort al cliente (no bloquea la respuesta si falla; queda
  // syncStatus=error para reintentar).
  await pushInvoiceToTenant(created.id).catch(() => null);

  await prisma.operationLog.create({
    data: {
      tenantId,
      action: "invoice.create",
      status: "success",
      details: {
        invoiceId: created.id,
        number: created.number,
        periodMonth: created.periodMonth,
        amountCents: created.amountCents,
      },
    },
  });

  return NextResponse.json({ invoice: created }, { status: 201 });
}
