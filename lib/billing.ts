import "server-only";
import type { Plan, Payment, Tenant, TenantSubscription } from "@prisma/client";
import { prisma } from "@/lib/db";

export type PaymentType =
  | "installation"
  | "monthly"
  | "yearly"
  | "other"
  | string;

export const PAYMENT_TYPES: PaymentType[] = [
  "installation",
  "monthly",
  "yearly",
  "other",
];

export const PAYMENT_TYPE_LABELS: Record<string, string> = {
  installation: "Instalación",
  monthly: "Cuota mensual",
  yearly: "Cuota anual",
  other: "Otro",
};

/**
 * Devuelve el precio mensual recurrente "efectivo" para un cliente:
 * - customMonthlyPrice si está fijado.
 * - si no, plan.monthlyPrice del plan asignado.
 * - 0 si no hay nada configurado.
 *
 * billingCycle = "yearly" significa que paga UNA vez al año, pero la
 * unidad de cálculo del MRR sigue siendo mensual.
 */
export function effectiveMonthlyPriceCents(
  sub: (TenantSubscription & { plan: Plan | null }) | null,
): number {
  if (!sub) return 0;
  if (sub.customMonthlyPrice !== null && sub.customMonthlyPrice !== undefined) {
    return sub.customMonthlyPrice;
  }
  return sub.plan?.monthlyPrice ?? 0;
}

export function effectiveYearlyPriceCents(
  sub: (TenantSubscription & { plan: Plan | null }) | null,
): number {
  if (!sub) return 0;
  // Si hay customMonthlyPrice, calculamos el año a partir de él.
  if (sub.customMonthlyPrice !== null && sub.customMonthlyPrice !== undefined) {
    return sub.customMonthlyPrice * 12;
  }
  return sub.plan?.yearlyPrice ?? sub.plan?.monthlyPrice ? (sub.plan!.monthlyPrice ?? 0) * 12 : 0;
}

export function installationPriceCents(
  sub: TenantSubscription | null,
): number {
  return sub?.installationPrice ?? 0;
}

export type BillingRow = {
  tenantId: string;
  tenantName: string;
  tenantSlug: string;
  tenantStatus: string;
  planSlug: string | null;
  planName: string | null;
  billingCycle: "monthly" | "yearly" | null;
  monthlyCents: number;
  yearlyCents: number;
  installationCents: number;
  installationPaidAt: Date | null;
  paymentStatus: string | null;
  paymentMethod: string | null;
  contractStartDate: Date | null;
  nextPaymentDate: Date | null;
  paidThisMonthCents: number;
  paidThisYearCents: number;
  lastPaymentAt: Date | null;
  hasOverrides: boolean;
};

export type BillingSummary = {
  rows: BillingRow[];
  totals: {
    activeTenants: number;
    totalTenants: number;
    mrrCents: number;
    arrCents: number;
    paidThisMonthCents: number;
    paidThisYearCents: number;
    paidLifetimeCents: number;
    pendingInstallationCents: number;
    overdueCount: number;
  };
};

const startOfMonth = () => {
  const d = new Date();
  return new Date(d.getFullYear(), d.getMonth(), 1, 0, 0, 0, 0);
};

const startOfYear = () => {
  const d = new Date();
  return new Date(d.getFullYear(), 0, 1, 0, 0, 0, 0);
};

/**
 * Carga toda la información de facturación de los tenants. Pensado para
 * el server component de /billing.
 */
export async function loadBillingSummary(): Promise<BillingSummary> {
  const monthStart = startOfMonth();
  const yearStart = startOfYear();

  const [tenants, payments] = await Promise.all([
    prisma.tenant.findMany({
      orderBy: { name: "asc" },
      include: { subscription: { include: { plan: true } } },
    }),
    prisma.payment.findMany({
      orderBy: { paidAt: "desc" },
    }),
  ]);

  const paidByTenant = new Map<
    string,
    { month: number; year: number; lifetime: number; last: Date | null }
  >();
  for (const p of payments) {
    const entry = paidByTenant.get(p.tenantId) ?? {
      month: 0,
      year: 0,
      lifetime: 0,
      last: null as Date | null,
    };
    entry.lifetime += p.amount;
    if (p.paidAt >= yearStart) entry.year += p.amount;
    if (p.paidAt >= monthStart) entry.month += p.amount;
    if (!entry.last || p.paidAt > entry.last) entry.last = p.paidAt;
    paidByTenant.set(p.tenantId, entry);
  }

  const rows: BillingRow[] = tenants.map((t) => {
    const sub = t.subscription;
    const plan = sub?.plan ?? null;
    const monthlyCents = effectiveMonthlyPriceCents(sub ?? null);
    const yearlyCents = effectiveYearlyPriceCents(sub ?? null);
    const installationCents = installationPriceCents(sub ?? null);
    const stats = paidByTenant.get(t.id);
    const hasOverrides =
      !!sub &&
      (sub.customMaxAdmins !== null ||
        sub.customMaxOffice !== null ||
        sub.customMaxSales !== null ||
        sub.customMultiWarehouse !== null ||
        sub.customApiAccess !== null ||
        sub.customMonthlyPrice !== null);

    return {
      tenantId: t.id,
      tenantName: t.name,
      tenantSlug: t.slug,
      tenantStatus: t.status,
      planSlug: plan?.slug ?? null,
      planName: plan?.name ?? null,
      billingCycle:
        (sub?.billingCycle as "monthly" | "yearly" | null) ?? null,
      monthlyCents,
      yearlyCents,
      installationCents,
      installationPaidAt: sub?.installationPaidAt ?? null,
      paymentStatus: sub?.paymentStatus ?? null,
      paymentMethod: sub?.paymentMethod ?? null,
      contractStartDate: sub?.contractStartDate ?? null,
      nextPaymentDate: sub?.nextPaymentDate ?? null,
      paidThisMonthCents: stats?.month ?? 0,
      paidThisYearCents: stats?.year ?? 0,
      lastPaymentAt: stats?.last ?? null,
      hasOverrides,
    } satisfies BillingRow;
  });

  const totals = rows.reduce(
    (acc, r) => {
      acc.totalTenants += 1;
      if (r.tenantStatus === "active") {
        acc.activeTenants += 1;
        acc.mrrCents += r.monthlyCents;
        acc.arrCents += r.yearlyCents;
      }
      acc.paidThisMonthCents += r.paidThisMonthCents;
      acc.paidThisYearCents += r.paidThisYearCents;
      if (r.installationCents > 0 && !r.installationPaidAt) {
        acc.pendingInstallationCents += r.installationCents;
      }
      if (r.paymentStatus === "overdue") acc.overdueCount += 1;
      return acc;
    },
    {
      activeTenants: 0,
      totalTenants: 0,
      mrrCents: 0,
      arrCents: 0,
      paidThisMonthCents: 0,
      paidThisYearCents: 0,
      paidLifetimeCents: 0,
      pendingInstallationCents: 0,
      overdueCount: 0,
    },
  );

  totals.paidLifetimeCents = payments.reduce((a, p) => a + p.amount, 0);

  return { rows, totals };
}

export async function listTenantPayments(
  tenantId: string,
  limit = 50,
): Promise<Payment[]> {
  return prisma.payment.findMany({
    where: { tenantId },
    orderBy: { paidAt: "desc" },
    take: limit,
  });
}

export type RecordPaymentInput = {
  tenantId: string;
  amountCents: number;
  type: string;
  paidAt: Date;
  method?: string | null;
  notes?: string | null;
  reference?: string | null;
};

export async function recordPayment(
  input: RecordPaymentInput,
): Promise<Payment> {
  const tenant = await prisma.tenant.findUnique({
    where: { id: input.tenantId },
  });
  if (!tenant) throw new Error("Tenant not found");

  const payment = await prisma.payment.create({
    data: {
      tenantId: input.tenantId,
      amount: input.amountCents,
      type: input.type,
      paidAt: input.paidAt,
      method: input.method?.trim() || null,
      notes: input.notes?.trim() || null,
      reference: input.reference?.trim() || null,
    },
  });

  // Side effects útiles: si el pago es de instalación, marcamos installationPaidAt.
  if (input.type === "installation") {
    await prisma.tenantSubscription.upsert({
      where: { tenantId: input.tenantId },
      update: { installationPaidAt: input.paidAt },
      create: {
        tenantId: input.tenantId,
        installationPaidAt: input.paidAt,
      },
    });
  }

  await prisma.operationLog.create({
    data: {
      tenantId: input.tenantId,
      action: "payment.record",
      status: "success",
      details: {
        type: input.type,
        amountCents: input.amountCents,
        method: input.method ?? null,
        reference: input.reference ?? null,
      },
    },
  });

  return payment;
}

export async function deletePayment(
  paymentId: string,
): Promise<void> {
  const payment = await prisma.payment.findUnique({
    where: { id: paymentId },
  });
  if (!payment) return;
  await prisma.payment.delete({ where: { id: paymentId } });
  await prisma.operationLog.create({
    data: {
      tenantId: payment.tenantId,
      action: "payment.delete",
      status: "success",
      details: {
        amountCents: payment.amount,
        type: payment.type,
        paidAt: payment.paidAt.toISOString(),
      },
    },
  });
}

// Convenience export for casual `formatEur` callers.
export type { Tenant, Plan, TenantSubscription, Payment };
