import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

vi.mock("@/lib/db", () => ({
  prisma: {
    tenant: { findUnique: vi.fn() },
    tenantSubscription: {
      findUnique: vi.fn(),
      update: vi.fn(),
      create: vi.fn(),
    },
    operationLog: {
      create: vi.fn().mockResolvedValue({ id: "log1" }),
    },
  },
}));

import { prisma } from "@/lib/db";
import { encrypt } from "@/lib/crypto";
import { syncTenantPlanToClient } from "@/lib/plan-resolver";

const findTenant = prisma.tenant.findUnique as unknown as ReturnType<typeof vi.fn>;
const findSub = prisma.tenantSubscription.findUnique as unknown as ReturnType<
  typeof vi.fn
>;
const updateSub = prisma.tenantSubscription.update as unknown as ReturnType<
  typeof vi.fn
>;
const createSub = prisma.tenantSubscription.create as unknown as ReturnType<
  typeof vi.fn
>;
const logCreate = prisma.operationLog.create as unknown as ReturnType<typeof vi.fn>;

const fetchSpy = vi.spyOn(globalThis, "fetch");

function fakeTenant() {
  return {
    id: "t1",
    name: "Cliente",
    slug: "cliente",
    apiUrl: "https://cliente.example.com",
    apiToken: encrypt("super-secret-token"),
    status: "active",
    notes: null,
    createdAt: new Date(),
    updatedAt: new Date(),
  };
}

function fakePlanRow() {
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
  };
}

function fakeSub(extras: Record<string, unknown> = {}) {
  return {
    id: "s1",
    tenantId: "t1",
    planId: "plan-pro",
    plan: fakePlanRow(),
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
    ...extras,
  };
}

beforeEach(() => {
  fetchSpy.mockReset();
  findTenant.mockReset();
  findSub.mockReset();
  updateSub.mockReset();
  createSub.mockReset();
  logCreate.mockClear();
  logCreate.mockResolvedValue({ id: "log1" });
});

afterEach(() => {
  vi.useRealTimers();
});

function jsonResponse(body: unknown, status = 200): Response {
  return new Response(JSON.stringify(body), {
    status,
    headers: { "content-type": "application/json" },
  }) as unknown as Response;
}

describe("syncTenantPlanToClient", () => {
  it("pushes effective limits to the tenant and updates lastSyncedAt", async () => {
    findSub.mockResolvedValue(fakeSub());
    findTenant.mockResolvedValue(fakeTenant());
    fetchSpy.mockResolvedValue(jsonResponse({ ok: true }));

    const r = await syncTenantPlanToClient("t1");
    expect(r.ok).toBe(true);

    const [url, init] = fetchSpy.mock.calls[0];
    expect(String(url)).toBe("https://cliente.example.com/api/admin/system/plan");
    expect((init as RequestInit).method).toBe("PUT");
    const body = JSON.parse(String((init as RequestInit).body));
    expect(body).toMatchObject({
      planSlug: "pro",
      planName: "Pro",
      maxAdmins: 2,
      maxOffice: 3,
      maxSales: 10,
      multiWarehouse: false,
      apiAccess: true,
    });

    expect(updateSub).toHaveBeenCalledTimes(1);
    expect(updateSub.mock.calls[0][0].data.syncStatus).toBe("ok");
    expect(updateSub.mock.calls[0][0].data.syncError).toBeNull();
    expect(updateSub.mock.calls[0][0].data.lastSyncedAt).toBeInstanceOf(Date);
  });

  it("flags syncStatus=failed when the tenant rejects", async () => {
    findSub.mockResolvedValue(fakeSub());
    findTenant.mockResolvedValue(fakeTenant());
    fetchSpy.mockResolvedValue(jsonResponse({ error: "denied" }, 403));

    const r = await syncTenantPlanToClient("t1");
    expect(r.ok).toBe(false);

    expect(updateSub).toHaveBeenCalledTimes(1);
    const data = updateSub.mock.calls[0][0].data;
    expect(data.syncStatus).toBe("failed");
    expect(data.syncError).toBe("denied");
  });

  it("creates a subscription row when none exists yet", async () => {
    findSub.mockResolvedValue(null);
    findTenant.mockResolvedValue(fakeTenant());
    fetchSpy.mockResolvedValue(jsonResponse({ ok: true }));

    const r = await syncTenantPlanToClient("t1");
    expect(r.ok).toBe(true);
    expect(createSub).toHaveBeenCalledTimes(1);
    const data = createSub.mock.calls[0][0].data;
    expect(data.tenantId).toBe("t1");
    expect(data.syncStatus).toBe("ok");
  });

  it("applies overrides in the body it pushes", async () => {
    findSub.mockResolvedValue(
      fakeSub({ customMaxSales: 5, customApiAccess: false }),
    );
    findTenant.mockResolvedValue(fakeTenant());
    fetchSpy.mockResolvedValue(jsonResponse({ ok: true }));

    await syncTenantPlanToClient("t1");
    const body = JSON.parse(String(fetchSpy.mock.calls[0][1]?.body));
    expect(body.maxSales).toBe(5);
    expect(body.apiAccess).toBe(false);
    expect(body.maxOffice).toBe(3); // unchanged from plan
  });
});
