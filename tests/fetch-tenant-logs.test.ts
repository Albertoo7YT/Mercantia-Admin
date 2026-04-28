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
  buildTenantLogsQuery,
  fetchTenantLogs,
} from "@/lib/api-client";

const findUnique = prisma.tenant.findUnique as unknown as ReturnType<typeof vi.fn>;
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
});

afterEach(() => {
  vi.useRealTimers();
});

describe("buildTenantLogsQuery", () => {
  it("omits undefined fields and joins level array", () => {
    expect(
      buildTenantLogsQuery({
        maxLines: 200,
        source: "stderr",
        level: ["error", "warn"],
        since: "2026-01-01T00:00:00.000Z",
        search: "boom",
      }),
    ).toEqual({
      maxLines: 200,
      source: "stderr",
      level: "error,warn",
      since: "2026-01-01T00:00:00.000Z",
      search: "boom",
    });
  });

  it("drops empty level array", () => {
    const q = buildTenantLogsQuery({ level: [] });
    expect("level" in q).toBe(false);
  });

  it("returns empty object when called with no opts", () => {
    expect(buildTenantLogsQuery()).toEqual({});
  });
});

describe("fetchTenantLogs", () => {
  it("forwards query params to the tenant URL", async () => {
    findUnique.mockResolvedValue(fakeTenant());
    fetchSpy.mockResolvedValue(
      new Response(
        JSON.stringify({
          entries: [],
          metadata: {
            pm2AppName: "mercantia-aizq",
            totalLinesRead: 0,
            fileExisted: { stdout: true, stderr: true },
            fileSizes: { stdout: 0, stderr: 0 },
          },
        }),
        { status: 200, headers: { "content-type": "application/json" } },
      ) as unknown as Response,
    );

    const r = await fetchTenantLogs("t1", {
      maxLines: 200,
      source: "combined",
      level: ["error", "warn"],
      search: "prestashop",
    });

    expect(r.ok).toBe(true);
    const [url, init] = fetchSpy.mock.calls[0];
    const u = new URL(String(url));
    expect(u.origin + u.pathname).toBe(
      "https://cliente.example.com/api/admin/system/logs",
    );
    expect(u.searchParams.get("maxLines")).toBe("200");
    expect(u.searchParams.get("source")).toBe("combined");
    expect(u.searchParams.get("level")).toBe("error,warn");
    expect(u.searchParams.get("search")).toBe("prestashop");
    expect((init as RequestInit).headers).toMatchObject({
      Authorization: "Bearer super-secret-token",
    });
  });

  it("returns ok=false when tenant returns 502", async () => {
    findUnique.mockResolvedValue(fakeTenant());
    fetchSpy.mockResolvedValue(
      new Response(JSON.stringify({ error: "logs file unreadable" }), {
        status: 502,
        headers: { "content-type": "application/json" },
      }) as unknown as Response,
    );
    const r = await fetchTenantLogs("t1");
    expect(r.ok).toBe(false);
    if (!r.ok) expect(r.error).toBe("logs file unreadable");
  });

  it("returns ok=false on network error", async () => {
    findUnique.mockResolvedValue(fakeTenant());
    fetchSpy.mockRejectedValue(new Error("ECONNREFUSED"));
    const r = await fetchTenantLogs("t1");
    expect(r.ok).toBe(false);
  });
});
