import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

vi.mock("@/lib/db", () => ({
  prisma: {
    tenant: { findUnique: vi.fn() },
    operationLog: {
      create: vi.fn().mockResolvedValue({ id: "log1" }),
      update: vi.fn().mockResolvedValue({ id: "log1" }),
    },
  },
}));

import { prisma } from "@/lib/db";
import { encrypt } from "@/lib/crypto";
import {
  fetchTenantModules,
  toggleTenantModule,
} from "@/lib/api-client";

const findUnique = prisma.tenant.findUnique as unknown as ReturnType<typeof vi.fn>;
const logCreate = prisma.operationLog.create as unknown as ReturnType<typeof vi.fn>;
const logUpdate = prisma.operationLog.update as unknown as ReturnType<typeof vi.fn>;

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
  logUpdate.mockClear();
  logCreate.mockResolvedValue({ id: "log1" });
  logUpdate.mockResolvedValue({ id: "log1" });
});

afterEach(() => {
  vi.useRealTimers();
});

describe("fetchTenantModules", () => {
  it("normalizes raw module shape and computes dependents", async () => {
    findUnique.mockResolvedValue(fakeTenant());
    fetchSpy.mockResolvedValue(
      new Response(
        JSON.stringify({
          modules: [
            { name: "core", category: "core", alwaysOn: true, enabled: true },
            {
              name: "sales",
              label: "Ventas",
              category: "sales",
              enabled: true,
              dependsOn: ["core"],
            },
            {
              name: "warranties",
              category: "sales",
              enabled: false,
              dependsOn: ["sales"],
            },
          ],
        }),
        { status: 200, headers: { "content-type": "application/json" } },
      ) as unknown as Response,
    );

    const r = await fetchTenantModules("t1");
    expect(r.ok).toBe(true);
    if (!r.ok) return;
    const core = r.modules.find((m) => m.name === "core")!;
    const sales = r.modules.find((m) => m.name === "sales")!;
    expect(core.alwaysOn).toBe(true);
    expect(core.dependents).toEqual(["sales"]);
    expect(sales.dependents).toEqual(["warranties"]);
    expect(sales.label).toBe("Ventas");
  });

  it("accepts a top-level array shape too", async () => {
    findUnique.mockResolvedValue(fakeTenant());
    fetchSpy.mockResolvedValue(
      new Response(JSON.stringify([{ name: "core", category: "core" }]), {
        status: 200,
        headers: { "content-type": "application/json" },
      }) as unknown as Response,
    );
    const r = await fetchTenantModules("t1");
    expect(r.ok).toBe(true);
    if (r.ok) expect(r.modules[0].name).toBe("core");
  });

  it("returns ok=false on 401", async () => {
    findUnique.mockResolvedValue(fakeTenant());
    fetchSpy.mockResolvedValue(
      new Response(JSON.stringify({ error: "bad token" }), {
        status: 401,
        headers: { "content-type": "application/json" },
      }) as unknown as Response,
    );
    const r = await fetchTenantModules("t1");
    expect(r.ok).toBe(false);
    if (!r.ok) expect(r.error).toBe("bad token");
  });

  it("returns ok=false on network error", async () => {
    findUnique.mockResolvedValue(fakeTenant());
    fetchSpy.mockRejectedValue(new Error("ECONNREFUSED"));
    const r = await fetchTenantModules("t1");
    expect(r.ok).toBe(false);
    if (!r.ok) expect(r.error).toMatch(/ECONNREFUSED|Network/);
  });
});

describe("toggleTenantModule (OperationLog flow)", () => {
  it("creates pending log then updates to success on 200", async () => {
    findUnique.mockResolvedValue(fakeTenant());
    fetchSpy.mockResolvedValue(
      new Response(JSON.stringify({ ok: true }), {
        status: 200,
        headers: { "content-type": "application/json" },
      }) as unknown as Response,
    );

    const r = await toggleTenantModule("t1", {
      module: "purchases",
      enabled: false,
      reason: "limpieza",
    });
    expect(r.ok).toBe(true);

    expect(logCreate).toHaveBeenCalledTimes(1);
    const creation = logCreate.mock.calls[0][0];
    expect(creation.data.action).toBe("module_toggle");
    expect(creation.data.status).toBe("pending");
    expect(creation.data.details).toMatchObject({
      module: "purchases",
      enabled: false,
      reason: "limpieza",
      tenantSlug: "cliente",
      tenantApiUrl: "https://cliente.example.com",
    });

    expect(logUpdate).toHaveBeenCalledTimes(1);
    expect(logUpdate.mock.calls[0][0]).toMatchObject({
      where: { id: "log1" },
      data: { status: "success" },
    });
  });

  it("updates pending log to error on upstream failure", async () => {
    findUnique.mockResolvedValue(fakeTenant());
    fetchSpy.mockResolvedValue(
      new Response(JSON.stringify({ error: "boom" }), {
        status: 500,
        headers: { "content-type": "application/json" },
      }) as unknown as Response,
    );

    const r = await toggleTenantModule("t1", {
      module: "purchases",
      enabled: false,
    });
    expect(r.ok).toBe(false);

    expect(logUpdate).toHaveBeenCalledTimes(1);
    const update = logUpdate.mock.calls[0][0];
    expect(update.data.status).toBe("error");
    expect(update.data.errorMessage).toContain("500");
  });

  it("flags DEPENDENCY_BLOCK on 400 with dependency-related message", async () => {
    findUnique.mockResolvedValue(fakeTenant());
    fetchSpy.mockResolvedValue(
      new Response(
        JSON.stringify({ error: "Cannot disable: dependency violation" }),
        {
          status: 400,
          headers: { "content-type": "application/json" },
        },
      ) as unknown as Response,
    );
    const r = await toggleTenantModule("t1", {
      module: "core",
      enabled: false,
    });
    expect(r.ok).toBe(false);
    if (!r.ok) expect(r.code).toBe("DEPENDENCY_BLOCK");
  });
});
