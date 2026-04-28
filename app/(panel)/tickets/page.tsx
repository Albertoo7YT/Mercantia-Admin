import { prisma } from "@/lib/db";
import { fetchTenantTickets } from "@/lib/api-client";
import { PageHeader } from "@/components/page-header";
import { UrlTicketsFiltersBar } from "@/components/tickets/filters-bar-url";
import { TicketsTable, type TicketRow } from "@/components/tickets/tickets-table";
import {
  isValidCategory,
  isValidPriority,
  isValidStatus,
  type TicketCategory,
  type TicketPriority,
  type TicketStatus,
} from "@/lib/tickets-constants";

export const dynamic = "force-dynamic";
export const metadata = { title: "Tickets · Mercantia Admin" };

type SearchParams = {
  status?: string;
  category?: string;
  priority?: string;
  search?: string;
  unreadOnly?: string;
  tenantId?: string;
};

type PageProps = { searchParams: Promise<SearchParams> };

function parseFilters(sp: SearchParams) {
  const status = (sp.status ?? "")
    .split(",")
    .filter(Boolean)
    .filter(isValidStatus) as TicketStatus[];
  const category = sp.category && isValidCategory(sp.category)
    ? (sp.category as TicketCategory)
    : undefined;
  const priority = sp.priority && isValidPriority(sp.priority)
    ? (sp.priority as TicketPriority)
    : undefined;
  return {
    status: status.length > 0 ? status : undefined,
    category,
    priority,
    search: sp.search?.slice(0, 200) || undefined,
    unreadOnly: sp.unreadOnly === "1" || sp.unreadOnly === "true",
    tenantId: sp.tenantId || undefined,
  };
}

export default async function GlobalTicketsPage({ searchParams }: PageProps) {
  const sp = await searchParams;
  const filters = parseFilters(sp);

  const allTenants = await prisma.tenant.findMany({
    where: { status: { not: "suspended" } },
    select: { id: true, name: true },
    orderBy: { name: "asc" },
  });

  const tenantsToQuery = filters.tenantId
    ? allTenants.filter((t) => t.id === filters.tenantId)
    : allTenants;

  const buckets = await Promise.all(
    tenantsToQuery.map(async (t) => {
      try {
        const r = await fetchTenantTickets(t.id, {
          status: filters.status,
          category: filters.category,
          priority: filters.priority,
          search: filters.search,
          unreadOnly: filters.unreadOnly,
        });
        if (!r.ok) {
          return {
            tenantId: t.id,
            tenantName: t.name,
            tickets: [] as TicketRow[],
            offline: true,
            error: r.error,
          };
        }
        const rows: TicketRow[] = r.tickets.map((tk) => ({
          ...tk,
          tenantId: t.id,
          tenantName: t.name,
        }));
        return {
          tenantId: t.id,
          tenantName: t.name,
          tickets: rows,
          offline: false,
          error: null,
        };
      } catch (e) {
        return {
          tenantId: t.id,
          tenantName: t.name,
          tickets: [] as TicketRow[],
          offline: true,
          error: (e as Error).message,
        };
      }
    }),
  );

  const allRows = buckets.flatMap((b) => b.tickets);
  allRows.sort((a, b) =>
    new Date(b.lastMessageAt).getTime() -
    new Date(a.lastMessageAt).getTime(),
  );

  const offlineTenants = buckets.filter((b) => b.offline);

  return (
    <>
      <PageHeader
        title="Bandeja de tickets"
        description={
          <span>
            {allRows.length} ticket{allRows.length === 1 ? "" : "s"}
            {offlineTenants.length > 0 ? (
              <>
                {" · "}
                <span className="text-amber-700 dark:text-amber-400">
                  {offlineTenants.length} cliente
                  {offlineTenants.length === 1 ? "" : "s"} sin conexión
                </span>
              </>
            ) : null}
          </span>
        }
      />

      <div className="mb-4">
        <UrlTicketsFiltersBar tenants={allTenants} />
      </div>

      {offlineTenants.length > 0 ? (
        <div className="mb-4 rounded-md border border-amber-300/60 bg-amber-50/50 p-3 text-sm dark:bg-amber-950/10">
          <p className="font-medium text-amber-800 dark:text-amber-200">
            Sin conexión:
          </p>
          <p className="text-xs text-muted-foreground">
            {offlineTenants.map((b) => b.tenantName).join(", ")}
          </p>
        </div>
      ) : null}

      <TicketsTable rows={allRows} showTenant />
    </>
  );
}
