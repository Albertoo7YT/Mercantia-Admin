import "server-only";
import { prisma } from "@/lib/db";
import { fetchTenantPlan, type TenantPlanData } from "@/lib/api-client";
import {
  diffLimits,
  resolveEffectiveLimits,
  type EffectiveLimits,
} from "@/lib/plan-resolver";

export type TenantSubscriptionRow = {
  tenantId: string;
  tenantName: string;
  tenantSlug: string;
  effective: EffectiveLimits;
  /** From the panel DB. */
  paymentStatus: string | null;
  nextPaymentDate: Date | null;
  syncStatus: string | null;
  lastSyncedAt: Date | null;
  hasOverrides: boolean;
  /** From the tenant API. null if the tenant didn't respond. */
  clientPlan: TenantPlanData | null;
  online: boolean;
  desyncFields: string[];
  highestUsagePct: number;
};

function pct(used: number, limit: number): number {
  if (limit <= 0) return used > 0 ? 100 : 0;
  return Math.min((used / limit) * 100, 9999);
}

export async function loadAllSubscriptions(): Promise<TenantSubscriptionRow[]> {
  const tenants = await prisma.tenant.findMany({
    where: { status: { not: "suspended" } },
    orderBy: { name: "asc" },
    include: {
      subscription: {
        include: { plan: true },
      },
    },
  });

  const rows = await Promise.all(
    tenants.map(async (t) => {
      const effective = resolveEffectiveLimits(t.subscription ?? null);

      let clientPlan: TenantPlanData | null = null;
      let online = false;
      try {
        const r = await fetchTenantPlan(t.id);
        if (r.ok) {
          clientPlan = r.data;
          online = true;
        }
      } catch {
        online = false;
      }

      const desyncFields = diffLimits(effective, clientPlan?.limits);
      const highest = clientPlan
        ? Math.max(
            pct(clientPlan.usage.sales, effective.maxSales),
            pct(clientPlan.usage.office, effective.maxOffice),
            pct(clientPlan.usage.admins, effective.maxAdmins),
          )
        : 0;

      return {
        tenantId: t.id,
        tenantName: t.name,
        tenantSlug: t.slug,
        effective,
        paymentStatus: t.subscription?.paymentStatus ?? null,
        nextPaymentDate: t.subscription?.nextPaymentDate ?? null,
        syncStatus: t.subscription?.syncStatus ?? null,
        lastSyncedAt: t.subscription?.lastSyncedAt ?? null,
        hasOverrides: effective.hasOverrides,
        clientPlan,
        online,
        desyncFields,
        highestUsagePct: highest,
      } satisfies TenantSubscriptionRow;
    }),
  );
  return rows;
}
