import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

vi.mock("@/lib/db", () => ({
  prisma: {
    tenant: { findUnique: vi.fn() },
    operationLog: {
      create: vi.fn().mockResolvedValue({ id: "log1" }),
    },
  },
}));

import { prisma } from "@/lib/db";
import { encrypt } from "@/lib/crypto";
import { updateTenantBranding } from "@/lib/api-client";

const findUnique = prisma.tenant.findUnique as unknown as ReturnType<typeof vi.fn>;
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

beforeEach(() => {
  fetchSpy.mockReset();
  findUnique.mockReset();
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

describe("updateTenantBranding", () => {
  it("PUTs to the tenant branding endpoint with the patch body", async () => {
    findUnique.mockResolvedValue(fakeTenant());
    fetchSpy.mockResolvedValue(
      jsonResponse({
        appName: "Mercantia",
        brandColor: "#FF0000",
      }),
    );

    const r = await updateTenantBranding("t1", { brandColor: "#FF0000" });
    expect(r.ok).toBe(true);

    const [url, init] = fetchSpy.mock.calls[0];
    expect(String(url)).toBe(
      "https://cliente.example.com/api/admin/system/branding",
    );
    expect((init as RequestInit).method).toBe("PUT");
    expect(JSON.parse(String((init as RequestInit).body))).toEqual({
      brandColor: "#FF0000",
    });
  });

  it("registers a success OperationLog with fieldsChanged", async () => {
    findUnique.mockResolvedValue(fakeTenant());
    fetchSpy.mockResolvedValue(
      jsonResponse({ appName: "M", brandColor: "#FF0000" }),
    );
    await updateTenantBranding("t1", {
      brandColor: "#FF0000",
      logoUrl: "/branding/logo.png",
    });
    expect(logCreate).toHaveBeenCalledTimes(1);
    const data = logCreate.mock.calls[0][0].data;
    expect(data.tenantId).toBe("t1");
    expect(data.action).toBe("tenant_branding_update");
    expect(data.status).toBe("success");
    expect(data.details.fieldsChanged.sort()).toEqual([
      "brandColor",
      "logoUrl",
    ]);
  });

  it("registers an error OperationLog when the tenant fails", async () => {
    findUnique.mockResolvedValue(fakeTenant());
    fetchSpy.mockResolvedValue(
      jsonResponse({ error: "denied" }, 403),
    );
    const r = await updateTenantBranding("t1", { brandColor: "#FF0000" });
    expect(r.ok).toBe(false);
    expect(logCreate).toHaveBeenCalledTimes(1);
    const data = logCreate.mock.calls[0][0].data;
    expect(data.status).toBe("error");
    expect(data.errorMessage).toContain("403");
    expect(data.details.fieldsChanged).toEqual(["brandColor"]);
  });
});
