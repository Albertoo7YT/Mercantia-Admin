import { describe, expect, it } from "vitest";
import { subscriptionUpdateSchema } from "@/lib/validation/subscription";

describe("subscriptionUpdateSchema", () => {
  it("accepts the exact payload the SubscriptionTab form sends with no overrides", () => {
    const r = subscriptionUpdateSchema.safeParse({
      planId: "plan-pro-id",
      customMaxAdmins: null,
      customMaxOffice: null,
      customMaxSales: null,
      customMultiWarehouse: null,
      customApiAccess: null,
      contractStartDate: null,
      billingCycle: null,
      customMonthlyPrice: null,
      nextPaymentDate: null,
      paymentStatus: null,
      paymentMethod: null,
      notes: null,
    });
    expect(r.success).toBe(true);
    if (r.success) {
      expect(r.data.planId).toBe("plan-pro-id");
      expect(r.data.customMaxSales).toBeNull();
      expect(r.data.contractStartDate).toBeNull();
    }
  });

  it("accepts a payload with overrides and prices", () => {
    const r = subscriptionUpdateSchema.safeParse({
      planId: "plan-pro-id",
      customMaxAdmins: 3,
      customMaxOffice: 5,
      customMaxSales: 8,
      customMultiWarehouse: true,
      customApiAccess: false,
      contractStartDate: "2026-01-01",
      billingCycle: "yearly",
      customMonthlyPrice: 4900,
      nextPaymentDate: "2027-01-01",
      paymentStatus: "active",
      paymentMethod: "Transferencia",
      notes: "  Cliente preferente  ",
    });
    expect(r.success).toBe(true);
    if (r.success) {
      expect(r.data.customMaxSales).toBe(8);
      expect(r.data.customMultiWarehouse).toBe(true);
      expect(r.data.customApiAccess).toBe(false);
      expect(r.data.contractStartDate).toBeInstanceOf(Date);
      expect(r.data.billingCycle).toBe("yearly");
      expect(r.data.customMonthlyPrice).toBe(4900);
      expect(r.data.notes).toBe("Cliente preferente");
    }
  });

  it("rejects negative numeric overrides", () => {
    const r = subscriptionUpdateSchema.safeParse({
      planId: null,
      customMaxSales: -1,
    });
    expect(r.success).toBe(false);
  });
});
