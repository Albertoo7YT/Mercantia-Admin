import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

vi.mock("@/lib/db", () => {
  return {
    prisma: {
      tenant: {
        findUnique: vi.fn(),
      },
      operationLog: {
        create: vi.fn().mockResolvedValue({}),
      },
    },
  };
});

import { prisma } from "@/lib/db";
import { encrypt } from "@/lib/crypto";
import { makeTenantApiCall } from "@/lib/api-client";

const mockedFindUnique = prisma.tenant.findUnique as unknown as ReturnType<typeof vi.fn>;

const fetchSpy = vi.spyOn(globalThis, "fetch");

beforeEach(() => {
  fetchSpy.mockReset();
  mockedFindUnique.mockReset();
  (prisma.operationLog.create as unknown as ReturnType<typeof vi.fn>).mockClear();
});

afterEach(() => {
  vi.useRealTimers();
});

function fakeTenant(overrides: Partial<{ id: string; apiUrl: string; apiToken: string }> = {}) {
  return {
    id: overrides.id ?? "t1",
    name: "Cliente",
    slug: "cliente",
    apiUrl: overrides.apiUrl ?? "https://cliente.example.com",
    apiToken: overrides.apiToken ?? encrypt("super-secret-token"),
    status: "active",
    notes: null,
    createdAt: new Date(),
    updatedAt: new Date(),
  };
}

describe("makeTenantApiCall", () => {
  it("returns ok=false with status 404 when tenant not found", async () => {
    mockedFindUnique.mockResolvedValue(null);
    const r = await makeTenantApiCall("missing", "/api/admin/system/health");
    expect(r.ok).toBe(false);
    if (!r.ok) {
      expect(r.status).toBe(404);
    }
    expect(fetchSpy).not.toHaveBeenCalled();
  });

  it("sends Authorization bearer with decrypted token and returns parsed JSON on success", async () => {
    mockedFindUnique.mockResolvedValue(fakeTenant());
    fetchSpy.mockResolvedValue(
      new Response(JSON.stringify({ status: "ok" }), {
        status: 200,
        headers: { "content-type": "application/json" },
      }) as unknown as Response,
    );

    const r = await makeTenantApiCall<{ status: string }>("t1", "/api/admin/system/health");
    expect(r.ok).toBe(true);
    if (r.ok) expect(r.data).toEqual({ status: "ok" });

    expect(fetchSpy).toHaveBeenCalledTimes(1);
    const [url, init] = fetchSpy.mock.calls[0];
    expect(String(url)).toBe("https://cliente.example.com/api/admin/system/health");
    expect((init as RequestInit).headers).toMatchObject({
      Authorization: "Bearer super-secret-token",
    });
  });

  it("returns ok=false with HTTP status when upstream errors", async () => {
    mockedFindUnique.mockResolvedValue(fakeTenant());
    fetchSpy.mockResolvedValue(
      new Response(JSON.stringify({ error: "nope" }), {
        status: 401,
        headers: { "content-type": "application/json" },
      }) as unknown as Response,
    );

    const r = await makeTenantApiCall("t1", "/api/admin/system/info");
    expect(r.ok).toBe(false);
    if (!r.ok) {
      expect(r.status).toBe(401);
      expect(r.error).toBe("nope");
    }
    expect(prisma.operationLog.create).toHaveBeenCalled();
  });

  it("aborts on timeout and returns status 0", async () => {
    mockedFindUnique.mockResolvedValue(fakeTenant());
    fetchSpy.mockImplementation(
      (_url: RequestInfo | URL, init?: RequestInit) =>
        new Promise((_resolve, reject) => {
          init?.signal?.addEventListener("abort", () => {
            const err = new Error("aborted");
            err.name = "AbortError";
            reject(err);
          });
        }),
    );

    const r = await makeTenantApiCall(
      "t1",
      "/api/admin/system/info",
      { timeoutMs: 20 },
    );
    expect(r.ok).toBe(false);
    if (!r.ok) {
      expect(r.status).toBe(0);
      expect(r.error).toMatch(/Timeout/);
    }
  });
});
