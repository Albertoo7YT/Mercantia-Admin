import { NextResponse } from "next/server";
import { z } from "zod";
import { getSession } from "@/lib/auth/middleware";
import { prisma } from "@/lib/db";
import {
  generateInvoicesForMonth,
  periodMonthOf,
  pushInvoiceToTenant,
} from "@/lib/invoices";

export const runtime = "nodejs";
export const maxDuration = 300;

const bodySchema = z.object({
  periodMonth: z
    .string()
    .regex(/^\d{4}-(0[1-9]|1[0-2])$/)
    .optional(),
});

/**
 * Genera (idempotente) las facturas mensuales para todos los tenants
 * activos. Si no se pasa periodMonth, usa el mes actual del servidor.
 * Empuja cada factura al cliente correspondiente.
 */
export async function POST(req: Request) {
  const session = await getSession();
  if (!session) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  let body: { periodMonth?: string } = {};
  try {
    body = bodySchema.parse(await req.json().catch(() => ({})));
  } catch (e) {
    return NextResponse.json(
      { error: "Cuerpo inválido", detail: (e as Error).message },
      { status: 400 },
    );
  }
  const periodMonth = body.periodMonth ?? periodMonthOf();

  const result = await generateInvoicesForMonth(periodMonth);

  // Push best-effort para todas las nuevas + las existentes que estuvieran
  // sin sincronizar.
  let pushOk = 0;
  let pushErr = 0;
  for (const id of result.invoiceIds) {
    const r = await pushInvoiceToTenant(id);
    if (r.ok) pushOk++;
    else pushErr++;
  }

  await prisma.operationLog.create({
    data: {
      action: "invoice.generate-month",
      status: "success",
      details: {
        periodMonth,
        total: result.total,
        created: result.created,
        skipped: result.skipped,
        pushOk,
        pushErr,
      },
    },
  });

  return NextResponse.json({
    periodMonth,
    total: result.total,
    created: result.created,
    skipped: result.skipped,
    pushOk,
    pushErr,
  });
}
