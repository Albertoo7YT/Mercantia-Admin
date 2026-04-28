import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

vi.mock("@/lib/db", () => ({
  prisma: {
    tenant: {
      findUnique: vi.fn(),
      findMany: vi.fn(),
    },
    operationLog: {
      create: vi.fn().mockResolvedValue({ id: "log1" }),
    },
  },
}));

vi.mock("@/lib/auth/middleware", () => ({
  getSession: vi.fn().mockResolvedValue({ expiresAt: new Date(Date.now() + 60_000) }),
  requireAuth: vi.fn(),
}));

import { prisma } from "@/lib/db";
import { encrypt } from "@/lib/crypto";
import { GET } from "@/app/api/tickets/unread-summary/route";

const findMany = prisma.tenant.findMany as unknown as ReturnType<typeof vi.fn>;
const findUnique = prisma.tenant.findUnique as unknown as ReturnType<typeof vi.fn>;
const fetchSpy = vi.spyOn(globalThis, "fetch");

function tenant(id: string, name: string) {
  return {
    id,
    name,
    slug: name.toLowerCase(),
    apiUrl: `https://${name.toLowerCase()}.example.com`,
    apiToken: encrypt("token"),
    status: "active",
    notes: null,
    createdAt: new Date(),
    updatedAt: new Date(),
  };
}

beforeEach(() => {
  fetchSpy.mockReset();
  findMany.mockReset();
  findUnique.mockReset();
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

describe("GET /api/tickets/unread-summary", () => {
  it("aggregates open + pending_admin counts and flags offline tenants", async () => {
    findMany.mockResolvedValue([
      { id: "a", name: "AlphaCo" },
      { id: "b", name: "BetaCo" },
      { id: "c", name: "GammaCo" },
    ]);
    findUnique.mockImplementation(({ where: { id } }: { where: { id: string } }) =>
      Promise.resolve(tenant(id, id)),
    );

    fetchSpy.mockImplementation((input: RequestInfo | URL) => {
      const url = String(input);
      if (url.startsWith("https://a.example.com")) {
        return Promise.resolve(
          jsonResponse({
            tickets: [
              { id: "1", status: "open" },
              { id: "2", status: "pending_admin" },
            ],
          }),
        );
      }
      if (url.startsWith("https://b.example.com")) {
        return Promise.resolve(
          jsonResponse({ tickets: [{ id: "3", status: "open" }] }),
        );
      }
      // GammaCo offline.
      return Promise.reject(new Error("ECONNREFUSED"));
    });

    const res = await GET();
    expect(res.status).toBe(200);
    const body = (await res.json()) as {
      totalUnread: number;
      byTenant: Array<{ tenantId: string; unreadCount: number; online: boolean }>;
    };
    expect(body.totalUnread).toBe(3);

    const byId = Object.fromEntries(
      body.byTenant.map((b) => [b.tenantId, b]),
    );
    expect(byId.a.unreadCount).toBe(2);
    expect(byId.a.online).toBe(true);
    expect(byId.b.unreadCount).toBe(1);
    expect(byId.b.online).toBe(true);
    expect(byId.c.unreadCount).toBe(0);
    expect(byId.c.online).toBe(false);
  });

  it("excludes resolved/closed/pending_user tickets even if the tenant returns them", async () => {
    findMany.mockResolvedValue([{ id: "a", name: "AlphaCo" }]);
    findUnique.mockImplementation(() => Promise.resolve(tenant("a", "a")));

    fetchSpy.mockResolvedValue(
      jsonResponse({
        tickets: [
          { id: "1", status: "open" }, // counts
          { id: "2", status: "resolved" }, // excluded
          { id: "3", status: "closed" }, // excluded
          { id: "4", status: "pending_user" }, // excluded
          { id: "5", status: "pending_admin" }, // counts
        ],
      }),
    );

    const res = await GET();
    const body = (await res.json()) as { totalUnread: number };
    expect(body.totalUnread).toBe(2);
  });

  it("requests tickets with status=open,pending_admin from the tenant", async () => {
    findMany.mockResolvedValue([{ id: "a", name: "AlphaCo" }]);
    findUnique.mockImplementation(() => Promise.resolve(tenant("a", "a")));
    fetchSpy.mockResolvedValue(jsonResponse({ tickets: [] }));

    await GET();
    const url = String(fetchSpy.mock.calls[0][0]);
    const u = new URL(url);
    expect(u.searchParams.get("status")).toBe("open,pending_admin");
    expect(u.searchParams.get("unreadOnly")).toBeNull();
  });
});
