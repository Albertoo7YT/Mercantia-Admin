import { NextResponse } from "next/server";
import { getSession } from "@/lib/auth/middleware";
import { prisma } from "@/lib/db";
import { fetchTenantTickets } from "@/lib/api-client";

export const runtime = "nodejs";

export type UnreadSummary = {
  totalUnread: number;
  byTenant: Array<{
    tenantId: string;
    tenantName: string;
    unreadCount: number;
    online: boolean;
  }>;
};

export async function GET() {
  const session = await getSession();
  if (!session) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  const tenants = await prisma.tenant.findMany({
    where: { status: { not: "suspended" } },
    select: { id: true, name: true },
    orderBy: { name: "asc" },
  });

  const results = await Promise.all(
    tenants.map(async (t) => {
      try {
        // The sidebar badge is for "tickets that need admin attention" — i.e.
        //   - open:           brand-new ticket the admin hasn't acted on
        //   - pending_admin:  user replied last, admin must respond
        // pending_user is excluded (admin already responded; waiting on user).
        // resolved/closed are obviously excluded.
        const r = await fetchTenantTickets(t.id, {
          status: ["open", "pending_admin"],
        });
        if (!r.ok) {
          return {
            tenantId: t.id,
            tenantName: t.name,
            unreadCount: 0,
            online: false,
          };
        }
        // Defensive client-side filter in case the tenant API ignored the
        // status filter and returned everything.
        const actionable = r.tickets.filter(
          (tk) => tk.status === "open" || tk.status === "pending_admin",
        );
        return {
          tenantId: t.id,
          tenantName: t.name,
          unreadCount: actionable.length,
          online: true,
        };
      } catch {
        return {
          tenantId: t.id,
          tenantName: t.name,
          unreadCount: 0,
          online: false,
        };
      }
    }),
  );

  const totalUnread = results.reduce((acc, x) => acc + x.unreadCount, 0);

  const summary: UnreadSummary = {
    totalUnread,
    byTenant: results,
  };
  return NextResponse.json(summary);
}
