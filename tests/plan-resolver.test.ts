import { describe, expect, it } from "vitest";
import type { Plan, TenantSubscription } from "@prisma/client";
import {
  diffLimits,
  DEFAULT_LIMITS,
  resolveEffectiveLimits,
  type SubscriptionWithPlan,
} from "@/lib/plan-resolver";

function plan(over: Partial<Plan> = {}): Plan {
  return {
    id: "plan-pro",
    slug: "pro",
    name: "Pro",
    monthlyPrice: 8300,
    yearlyPrice: 99000,
    maxAdmins: 2,
    maxOffice: 3,
    maxSales: 10,
    multiWarehouse: false,
    apiAccess: true,
    description: null,
    isPopular: true,
    sortOrder: 2,
    active: true,
    createdAt: new Date(),
    updatedAt: new Date(),
    ...over,
  } as Plan;
}

function sub(
  over: Partial<TenantSubscription> = {},
  withPlan: Plan | null = plan(),
): SubscriptionWithPlan {
  return {
    id: "s1",
    tenantId: "t1",
    planId: withPlan?.id ?? null,
    plan: withPlan,
    customMaxAdmins: null,
    customMaxOffice: null,
    customMaxSales: null,
    customMultiWarehouse: null,
    customApiAccess: null,
    contractStartDate: null,
    billingCycle: null,
    customMonthlyPrice: null,
    nextPaymentDate: null,
    paymentStatus: "active",
    paymentMethod: null,
    lastSyncedAt: null,
    syncStatus: null,
    syncError: null,
    notes: null,
    createdAt: new Date(),
    updatedAt: new Date(),
    ...over,
  } as SubscriptionWithPlan;
}

describe("resolveEffectiveLimits", () => {
  it("falls back to DEFAULT_LIMITS when there is no subscription", () => {
    const r = resolveEffectiveLimits(null);
    expect(r).toEqual({ ...DEFAULT_LIMITS, hasOverrides: false });
  });

  it("uses plan values when there are no overrides", () => {
    const r = resolveEffectiveLimits(sub());
    expect(r.planSlug).toBe("pro");
    expect(r.maxSales).toBe(10);
    expect(r.maxOffice).toBe(3);
    expect(r.maxAdmins).toBe(2);
    expect(r.apiAccess).toBe(true);
    expect(r.multiWarehouse).toBe(false);
    expect(r.hasOverrides).toBe(false);
  });

  it("applies numeric overrides on top of the plan", () => {
    const r = resolveEffectiveLimits(
      sub({ customMaxSales: 5, customMaxAdmins: 1 }),
    );
    expect(r.maxSales).toBe(5);
    expect(r.maxOffice).toBe(3);
    expect(r.maxAdmins).toBe(1);
    expect(r.hasOverrides).toBe(true);
  });

  it("applies boolean overrides too", () => {
    const r = resolveEffectiveLimits(
      sub({ customMultiWarehouse: true, customApiAccess: false }),
    );
    expect(r.multiWarehouse).toBe(true);
    expect(r.apiAccess).toBe(false);
    expect(r.hasOverrides).toBe(true);
  });

  it("uses defaults when subscription has no plan", () => {
    const r = resolveEffectiveLimits(sub({}, null));
    expect(r.planSlug).toBe("none");
    expect(r.maxSales).toBe(DEFAULT_LIMITS.maxSales);
  });
});

describe("diffLimits", () => {
  it("returns empty array when panel and client match", () => {
    const panel = resolveEffectiveLimits(sub());
    expect(
      diffLimits(panel, {
        planSlug: "pro",
        planName: "Pro",
        maxAdmins: 2,
        maxOffice: 3,
        maxSales: 10,
        multiWarehouse: false,
        apiAccess: true,
      }),
    ).toEqual([]);
  });

  it("flags every divergent field", () => {
    const panel = resolveEffectiveLimits(sub());
    const diffs = diffLimits(panel, {
      planSlug: "starter",
      planName: "Starter",
      maxAdmins: 1,
      maxOffice: 1,
      maxSales: 3,
      multiWarehouse: false,
      apiAccess: false,
    });
    expect(diffs.sort()).toEqual([
      "apiAccess",
      "maxAdmins",
      "maxOffice",
      "maxSales",
      "planSlug",
    ]);
  });

  it("flags 'unsynced' when no client data is available", () => {
    const panel = resolveEffectiveLimits(sub());
    expect(diffLimits(panel, null)).toEqual(["unsynced"]);
  });
});
