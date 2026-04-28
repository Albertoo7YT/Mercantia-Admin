import type { Plan, Prisma, TenantSubscription } from "@prisma/client";
import { prisma } from "@/lib/db";
import { pushTenantPlan, type TenantPlanLimits } from "@/lib/api-client";

export const DEFAULT_LIMITS: TenantPlanLimits = {
  planSlug: "none",
  planName: "Sin plan",
  maxAdmins: 1,
  maxOffice: 1,
  maxSales: 3,
  multiWarehouse: false,
  apiAccess: false,
};

export interface EffectiveLimits {
  planSlug: string;
  planName: string;
  maxAdmins: number;
  maxOffice: number;
  maxSales: number;
  multiWarehouse: boolean;
  apiAccess: boolean;
  hasOverrides: boolean;
}

export type SubscriptionWithPlan = TenantSubscription & {
  plan: Plan | null;
};

export function resolveEffectiveLimits(
  subscription: SubscriptionWithPlan | null,
): EffectiveLimits {
  if (!subscription) {
    return { ...DEFAULT_LIMITS, hasOverrides: false };
  }

  const plan = subscription.plan;
  const base: EffectiveLimits = plan
    ? {
        planSlug: plan.slug,
        planName: plan.name,
        maxAdmins: plan.maxAdmins,
        maxOffice: plan.maxOffice,
        maxSales: plan.maxSales,
        multiWarehouse: plan.multiWarehouse,
        apiAccess: plan.apiAccess,
        hasOverrides: false,
      }
    : { ...DEFAULT_LIMITS, hasOverrides: false };

  let overridden = false;
  if (subscription.customMaxAdmins !== null && subscription.customMaxAdmins !== undefined) {
    base.maxAdmins = subscription.customMaxAdmins;
    overridden = true;
  }
  if (subscription.customMaxOffice !== null && subscription.customMaxOffice !== undefined) {
    base.maxOffice = subscription.customMaxOffice;
    overridden = true;
  }
  if (subscription.customMaxSales !== null && subscription.customMaxSales !== undefined) {
    base.maxSales = subscription.customMaxSales;
    overridden = true;
  }
  if (
    subscription.customMultiWarehouse !== null &&
    subscription.customMultiWarehouse !== undefined
  ) {
    base.multiWarehouse = subscription.customMultiWarehouse;
    overridden = true;
  }
  if (
    subscription.customApiAccess !== null &&
    subscription.customApiAccess !== undefined
  ) {
    base.apiAccess = subscription.customApiAccess;
    overridden = true;
  }
  base.hasOverrides = overridden;
  return base;
}

/**
 * Compares panel-side effective limits with what the client reported.
 * Returns the list of fields that differ (empty array = in sync).
 */
export function diffLimits(
  panel: EffectiveLimits,
  client: TenantPlanLimits | null | undefined,
): string[] {
  if (!client) return ["unsynced"];
  const diffs: string[] = [];
  if (panel.planSlug !== client.planSlug) diffs.push("planSlug");
  if (panel.maxAdmins !== client.maxAdmins) diffs.push("maxAdmins");
  if (panel.maxOffice !== client.maxOffice) diffs.push("maxOffice");
  if (panel.maxSales !== client.maxSales) diffs.push("maxSales");
  if (Boolean(panel.multiWarehouse) !== Boolean(client.multiWarehouse)) {
    diffs.push("multiWarehouse");
  }
  if (Boolean(panel.apiAccess) !== Boolean(client.apiAccess)) {
    diffs.push("apiAccess");
  }
  return diffs;
}

/**
 * Loads (or creates) the subscription, resolves effective limits, and pushes
 * them to the tenant via /api/admin/system/plan. Updates lastSyncedAt /
 * syncStatus / syncError accordingly.
 */
export async function syncTenantPlanToClient(
  tenantId: string,
): Promise<{ ok: true } | { ok: false; error: string }> {
  const subscription = await prisma.tenantSubscription.findUnique({
    where: { tenantId },
    include: { plan: true },
  });

  const limits = resolveEffectiveLimits(subscription);

  const result = await pushTenantPlan(tenantId, {
    planSlug: limits.planSlug,
    planName: limits.planName,
    maxAdmins: limits.maxAdmins,
    maxOffice: limits.maxOffice,
    maxSales: limits.maxSales,
    multiWarehouse: limits.multiWarehouse,
    apiAccess: limits.apiAccess,
  });

  // Persist sync status. Always touch even when there is no subscription row
  // yet (we'll create one with planId=null so the metadata exists).
  if (subscription) {
    await prisma.tenantSubscription.update({
      where: { tenantId },
      data: result.ok
        ? {
            lastSyncedAt: new Date(),
            syncStatus: "ok",
            syncError: null,
          }
        : {
            syncStatus: "failed",
            syncError: result.error.slice(0, 1000),
          },
    });
  } else {
    await prisma.tenantSubscription.create({
      data: {
        tenantId,
        lastSyncedAt: result.ok ? new Date() : null,
        syncStatus: result.ok ? "ok" : "failed",
        syncError: result.ok ? null : result.error.slice(0, 1000),
      },
    });
  }

  return result.ok ? { ok: true } : { ok: false, error: result.error };
}

export type SubscriptionUpdateInput = {
  planId?: string | null;
  customMaxAdmins?: number | null;
  customMaxOffice?: number | null;
  customMaxSales?: number | null;
  customMultiWarehouse?: boolean | null;
  customApiAccess?: boolean | null;
  contractStartDate?: Date | null;
  billingCycle?: string | null;
  customMonthlyPrice?: number | null;
  nextPaymentDate?: Date | null;
  paymentStatus?: string | null;
  paymentMethod?: string | null;
  notes?: string | null;
};

export async function upsertSubscription(
  tenantId: string,
  input: SubscriptionUpdateInput,
): Promise<SubscriptionWithPlan> {
  const data: Prisma.TenantSubscriptionUncheckedUpdateInput = {};
  for (const [k, v] of Object.entries(input)) {
    (data as Record<string, unknown>)[k] = v;
  }
  const createInput: Prisma.TenantSubscriptionUncheckedCreateInput = {
    ...(input as Prisma.TenantSubscriptionUncheckedCreateInput),
    tenantId,
  };
  const created = await prisma.tenantSubscription.upsert({
    where: { tenantId },
    update: data,
    create: createInput,
    include: { plan: true },
  });
  return created;
}
