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
  buildTicketsQuery,
  fetchTenantTickets,
  postTenantTicketMessage,
  updateTenantTicketStatus,
} from "@/lib/api-client";

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

describe("buildTicketsQuery", () => {
  it("joins status as csv", () => {
    expect(
      buildTicketsQuery({ status: ["open", "pending_admin"] }),
    ).toEqual({ status: "open,pending_admin" });
  });

  it("omits empty status array", () => {
    expect(buildTicketsQuery({ status: [] })).toEqual({});
  });

  it("forwards search/category/priority/unreadOnly", () => {
    expect(
      buildTicketsQuery({
        category: "billing",
        priority: "high",
        search: "factura",
        unreadOnly: true,
      }),
    ).toEqual({
      category: "billing",
      priority: "high",
      search: "factura",
      unreadOnly: "1",
    });
  });
});

describe("fetchTenantTickets", () => {
  it("forwards filters to the tenant URL with Authorization", async () => {
    findUnique.mockResolvedValue(fakeTenant());
    fetchSpy.mockResolvedValue(jsonResponse({ tickets: [] }));
    const r = await fetchTenantTickets("t1", {
      status: ["open"],
      unreadOnly: true,
    });
    expect(r.ok).toBe(true);
    const [url, init] = fetchSpy.mock.calls[0];
    const u = new URL(String(url));
    expect(u.origin + u.pathname).toBe(
      "https://cliente.example.com/api/admin/system/tickets",
    );
    expect(u.searchParams.get("status")).toBe("open");
    expect(u.searchParams.get("unreadOnly")).toBe("1");
    expect((init as RequestInit).headers).toMatchObject({
      Authorization: "Bearer super-secret-token",
    });
  });

  it("normalizes a top-level array response", async () => {
    findUnique.mockResolvedValue(fakeTenant());
    fetchSpy.mockResolvedValue(
      jsonResponse([
        { id: "1", number: 7, subject: "x", category: "billing" },
      ]),
    );
    const r = await fetchTenantTickets("t1");
    expect(r.ok).toBe(true);
    if (r.ok) expect(r.tickets).toHaveLength(1);
  });

  it("returns ok=false on 502", async () => {
    findUnique.mockResolvedValue(fakeTenant());
    fetchSpy.mockResolvedValue(jsonResponse({ error: "boom" }, 502));
    const r = await fetchTenantTickets("t1");
    expect(r.ok).toBe(false);
  });
});

describe("postTenantTicketMessage", () => {
  it("posts multipart with content + internalNote + attachments and logs success", async () => {
    findUnique.mockResolvedValue(fakeTenant());
    fetchSpy.mockResolvedValue(jsonResponse({ ok: true }));

    const file = new File(["data"], "trace.txt", { type: "text/plain" });
    const r = await postTenantTicketMessage("t1", "tk-1", {
      content: "Hola",
      internalNote: true,
      attachments: [file],
    });
    expect(r.ok).toBe(true);

    const [url, init] = fetchSpy.mock.calls[0];
    expect(String(url)).toBe(
      "https://cliente.example.com/api/admin/system/tickets/tk-1/messages",
    );
    expect((init as RequestInit).method).toBe("POST");
    expect((init as RequestInit).body).toBeInstanceOf(FormData);

    expect(logCreate).toHaveBeenCalledTimes(1);
    const data = logCreate.mock.calls[0][0].data;
    expect(data.action).toBe("tenant_ticket_reply");
    expect(data.status).toBe("success");
    expect(data.details).toMatchObject({
      ticketId: "tk-1",
      internalNote: true,
      attachmentsCount: 1,
    });
  });

  it("logs error when tenant rejects", async () => {
    findUnique.mockResolvedValue(fakeTenant());
    fetchSpy.mockResolvedValue(jsonResponse({ error: "no" }, 400));
    const r = await postTenantTicketMessage("t1", "tk-1", { content: "x" });
    expect(r.ok).toBe(false);
    expect(logCreate).toHaveBeenCalledTimes(1);
    expect(logCreate.mock.calls[0][0].data.status).toBe("error");
  });
});

describe("updateTenantTicketStatus", () => {
  it("PATCHes with status and logs old/new", async () => {
    findUnique.mockResolvedValue(fakeTenant());
    fetchSpy.mockResolvedValue(jsonResponse({ ok: true }));

    const r = await updateTenantTicketStatus("t1", "tk-1", "resolved", "open");
    expect(r.ok).toBe(true);

    const [url, init] = fetchSpy.mock.calls[0];
    expect(String(url)).toBe(
      "https://cliente.example.com/api/admin/system/tickets/tk-1",
    );
    expect((init as RequestInit).method).toBe("PATCH");
    expect(JSON.parse(String((init as RequestInit).body))).toEqual({
      status: "resolved",
    });

    expect(logCreate).toHaveBeenCalledTimes(1);
    const data = logCreate.mock.calls[0][0].data;
    expect(data.action).toBe("tenant_ticket_status_change");
    expect(data.status).toBe("success");
    expect(data.details).toMatchObject({
      ticketId: "tk-1",
      oldStatus: "open",
      newStatus: "resolved",
    });
  });
});
