import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

vi.mock("@/lib/db", () => ({
  prisma: {
    tenant: { findUnique: vi.fn() },
    operationLog: {
      create: vi.fn(),
      update: vi.fn(),
      findFirst: vi.fn(),
    },
  },
}));

import { prisma } from "@/lib/db";
import { encrypt } from "@/lib/crypto";
import {
  getTenantActionStatus,
  triggerTenantAction,
} from "@/lib/api-client";

const findUnique = prisma.tenant.findUnique as unknown as ReturnType<typeof vi.fn>;
const logCreate = prisma.operationLog.create as unknown as ReturnType<typeof vi.fn>;
const logUpdate = prisma.operationLog.update as unknown as ReturnType<typeof vi.fn>;
const logFindFirst = prisma.operationLog.findFirst as unknown as ReturnType<
  typeof vi.fn
>;

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
  logCreate.mockReset();
  logUpdate.mockReset();
  logFindFirst.mockReset();
  logCreate.mockResolvedValue({ id: "log1" });
  logUpdate.mockResolvedValue({ id: "log1" });
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

describe("triggerTenantAction", () => {
  it("creates pending OperationLog, calls tenant, then patches actionId", async () => {
    findUnique.mockResolvedValue(fakeTenant());
    fetchSpy.mockResolvedValue(
      jsonResponse({
        id: "act-123",
        type: "deploy",
        status: "pending",
        startedAt: "2026-04-27T16:00:00Z",
        createdAt: "2026-04-27T16:00:00Z",
      }),
    );

    const r = await triggerTenantAction("t1", "deploy", { foo: "bar" });
    expect(r.ok).toBe(true);
    if (!r.ok) return;
    expect(r.action.id).toBe("act-123");
    expect(r.operationLogId).toBe("log1");

    expect(logCreate).toHaveBeenCalledTimes(1);
    expect(logCreate.mock.calls[0][0].data).toMatchObject({
      tenantId: "t1",
      action: "tenant_action_deploy",
      status: "pending",
    });
    expect(logCreate.mock.calls[0][0].data.details).toMatchObject({
      type: "deploy",
      metadata: { foo: "bar" },
      actionId: null,
      tenantSlug: "cliente",
      tenantApiUrl: "https://cliente.example.com",
    });

    expect(logUpdate).toHaveBeenCalledTimes(1);
    const update = logUpdate.mock.calls[0][0];
    expect(update.where).toEqual({ id: "log1" });
    expect(update.data.details).toMatchObject({ actionId: "act-123" });

    const [url, init] = fetchSpy.mock.calls[0];
    expect(String(url)).toBe(
      "https://cliente.example.com/api/admin/system/actions",
    );
    expect((init as RequestInit).method).toBe("POST");
  });

  it("marks the OperationLog as error when the tenant call fails", async () => {
    findUnique.mockResolvedValue(fakeTenant());
    fetchSpy.mockResolvedValue(jsonResponse({ error: "denied" }, 403));

    const r = await triggerTenantAction("t1", "restart_pm2");
    expect(r.ok).toBe(false);

    expect(logUpdate).toHaveBeenCalledTimes(1);
    const update = logUpdate.mock.calls[0][0];
    expect(update.data.status).toBe("error");
    expect(update.data.errorMessage).toContain("403");
  });

  it("returns ok=false if tenant does not exist", async () => {
    findUnique.mockResolvedValue(null);
    const r = await triggerTenantAction("nope", "backup_now");
    expect(r.ok).toBe(false);
    expect(logCreate).not.toHaveBeenCalled();
  });
});

describe("getTenantActionStatus reconciliation", () => {
  it("updates pending OperationLog to success when action completes", async () => {
    fetchSpy.mockResolvedValue(
      jsonResponse({
        id: "act-1",
        type: "deploy",
        status: "completed",
        completedAt: "2026-04-27T16:05:00Z",
        durationMs: 32_000,
        exitCode: 0,
        createdAt: "2026-04-27T16:00:00Z",
      }),
    );
    findUnique.mockResolvedValue(fakeTenant());
    logFindFirst.mockResolvedValue({
      id: "log1",
      details: {
        type: "deploy",
        metadata: null,
        actionId: "act-1",
        tenantSlug: "cliente",
      },
    });

    const r = await getTenantActionStatus("t1", "act-1");
    expect(r.ok).toBe(true);

    expect(logFindFirst).toHaveBeenCalledTimes(1);
    expect(logFindFirst.mock.calls[0][0].where).toMatchObject({
      tenantId: "t1",
      status: "pending",
      details: { path: ["actionId"], equals: "act-1" },
    });

    expect(logUpdate).toHaveBeenCalledTimes(1);
    const upd = logUpdate.mock.calls[0][0];
    expect(upd.where).toEqual({ id: "log1" });
    expect(upd.data.status).toBe("success");
    expect(upd.data.errorMessage).toBeNull();
    expect(upd.data.details).toMatchObject({
      exitCode: 0,
      durationMs: 32_000,
    });
  });

  it("updates pending OperationLog to error when action fails", async () => {
    fetchSpy.mockResolvedValue(
      jsonResponse({
        id: "act-2",
        type: "deploy",
        status: "failed",
        errorMessage: "tests broke",
        completedAt: "2026-04-27T16:05:00Z",
        durationMs: 12_000,
        exitCode: 1,
        createdAt: "2026-04-27T16:00:00Z",
      }),
    );
    findUnique.mockResolvedValue(fakeTenant());
    logFindFirst.mockResolvedValue({
      id: "log2",
      details: { type: "deploy", actionId: "act-2" },
    });

    const r = await getTenantActionStatus("t1", "act-2");
    expect(r.ok).toBe(true);

    expect(logUpdate).toHaveBeenCalledTimes(1);
    const upd = logUpdate.mock.calls[0][0];
    expect(upd.data.status).toBe("error");
    expect(upd.data.errorMessage).toBe("tests broke");
    expect(upd.data.details).toMatchObject({ exitCode: 1, durationMs: 12_000 });
  });

  it("does not update OperationLog while action is still running", async () => {
    fetchSpy.mockResolvedValue(
      jsonResponse({
        id: "act-3",
        type: "deploy",
        status: "running",
        startedAt: "2026-04-27T16:00:00Z",
        createdAt: "2026-04-27T16:00:00Z",
      }),
    );
    findUnique.mockResolvedValue(fakeTenant());

    const r = await getTenantActionStatus("t1", "act-3");
    expect(r.ok).toBe(true);
    expect(logFindFirst).not.toHaveBeenCalled();
    expect(logUpdate).not.toHaveBeenCalled();
  });

  it("is a no-op when no matching pending log exists", async () => {
    fetchSpy.mockResolvedValue(
      jsonResponse({
        id: "act-4",
        type: "backup_now",
        status: "completed",
        completedAt: "2026-04-27T16:05:00Z",
        durationMs: 12_000,
        exitCode: 0,
        createdAt: "2026-04-27T16:00:00Z",
      }),
    );
    findUnique.mockResolvedValue(fakeTenant());
    logFindFirst.mockResolvedValue(null);

    const r = await getTenantActionStatus("t1", "act-4");
    expect(r.ok).toBe(true);
    expect(logUpdate).not.toHaveBeenCalled();
  });
});
