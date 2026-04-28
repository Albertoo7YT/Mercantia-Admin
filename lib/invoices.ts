import "server-only";
import { prisma } from "@/lib/db";
import { tenantApi } from "@/lib/api-client";

function monthlyPriceFromSub(sub: {
  customMonthlyPrice: number | null;
  plan: { monthlyPrice: number } | null;
} | null): number {
  if (!sub) return 0;
  if (sub.customMonthlyPrice !== null && sub.customMonthlyPrice !== undefined) {
    return sub.customMonthlyPrice;
  }
  return sub.plan?.monthlyPrice ?? 0;
}

export type InvoiceStatus = "pending" | "paid" | "cancelled";

/**
 * Devuelve "YYYY-MM" para una fecha (o el mes actual si no se pasa).
 */
export function periodMonthOf(date: Date = new Date()): string {
  const y = date.getFullYear();
  const m = String(date.getMonth() + 1).padStart(2, "0");
  return `${y}-${m}`;
}

/**
 * Construye el número de factura estable y único. Convierte el slug a un
 * formato seguro (sin caracteres raros).
 */
export function buildInvoiceNumber(periodMonth: string, slug: string): string {
  const safeSlug = slug.replace(/[^A-Za-z0-9._-]/g, "_");
  return `${periodMonth}-${safeSlug}`;
}

/**
 * Empuja una factura al cliente vía la API admin del tenant. Actualiza los
 * campos syncedAt / syncStatus / syncError.
 */
export async function pushInvoiceToTenant(invoiceId: string): Promise<{
  ok: boolean;
  error?: string;
}> {
  const invoice = await prisma.invoice.findUnique({
    where: { id: invoiceId },
    include: { tenant: { select: { id: true } } },
  });
  if (!invoice) return { ok: false, error: "Factura no encontrada" };

  const payload = {
    number: invoice.number,
    periodMonth: invoice.periodMonth,
    amountCents: invoice.amountCents,
    status: invoice.status as InvoiceStatus,
    issuedAt: invoice.issuedAt.toISOString(),
    dueDate: invoice.dueDate ? invoice.dueDate.toISOString() : null,
    paidAt: invoice.paidAt ? invoice.paidAt.toISOString() : null,
    paymentMethod: invoice.paymentMethod,
    paymentReference: invoice.paymentReference,
    notes: invoice.notes,
  };

  const res = await tenantApi.invoices.push(invoice.tenantId, payload);
  if (res.ok) {
    await prisma.invoice.update({
      where: { id: invoice.id },
      data: { syncedAt: new Date(), syncStatus: "ok", syncError: null },
    });
    return { ok: true };
  } else {
    await prisma.invoice.update({
      where: { id: invoice.id },
      data: { syncStatus: "error", syncError: res.error },
    });
    return { ok: false, error: res.error };
  }
}

/**
 * Genera (o devuelve, si ya existe) la factura del mes para un tenant
 * concreto, basándose en su precio efectivo. No la empuja al cliente —
 * eso lo hace el llamador con pushInvoiceToTenant.
 */
export async function ensureInvoiceForTenantMonth(
  tenantId: string,
  periodMonth: string,
): Promise<{ created: boolean; invoiceId: string } | { error: string }> {
  const tenant = await prisma.tenant.findUnique({
    where: { id: tenantId },
    include: { subscription: { include: { plan: true } } },
  });
  if (!tenant) return { error: "Tenant no encontrado" };

  const existing = await prisma.invoice.findUnique({
    where: { tenantId_periodMonth: { tenantId, periodMonth } },
  });
  if (existing) {
    return { created: false, invoiceId: existing.id };
  }

  const amount = monthlyPriceFromSub(
    tenant.subscription
      ? {
          customMonthlyPrice: tenant.subscription.customMonthlyPrice,
          plan: tenant.subscription.plan
            ? { monthlyPrice: tenant.subscription.plan.monthlyPrice }
            : null,
        }
      : null,
  );

  // Due date: día 15 del mes facturado por defecto.
  const [y, m] = periodMonth.split("-").map((s) => parseInt(s, 10));
  const dueDate = new Date(Date.UTC(y, m - 1, 15));

  const number = buildInvoiceNumber(periodMonth, tenant.slug);

  const created = await prisma.invoice.create({
    data: {
      tenantId,
      number,
      periodMonth,
      amountCents: amount,
      status: "pending",
      issuedAt: new Date(),
      dueDate,
    },
  });

  return { created: true, invoiceId: created.id };
}

/**
 * Genera facturas para todos los tenants activos en el mes indicado.
 * No empuja: el llamador hace el bucle de push si quiere.
 */
export async function generateInvoicesForMonth(periodMonth: string): Promise<{
  total: number;
  created: number;
  skipped: number;
  invoiceIds: string[];
}> {
  const tenants = await prisma.tenant.findMany({
    where: { status: { not: "suspended" } },
    select: { id: true },
  });

  let created = 0;
  let skipped = 0;
  const invoiceIds: string[] = [];

  for (const t of tenants) {
    const r = await ensureInvoiceForTenantMonth(t.id, periodMonth);
    if ("error" in r) continue;
    invoiceIds.push(r.invoiceId);
    if (r.created) created++;
    else skipped++;
  }

  return { total: tenants.length, created, skipped, invoiceIds };
}
