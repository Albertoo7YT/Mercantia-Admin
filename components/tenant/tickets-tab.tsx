"use client";

import { useMemo, useState } from "react";
import { useQuery } from "@tanstack/react-query";
import { RotateCw } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Skeleton } from "@/components/ui/skeleton";
import { ErrorState } from "@/components/ui/error-state";
import {
  TicketsFiltersBar,
  type TicketsFilters,
} from "@/components/tickets/filters-bar";
import { TicketsTable } from "@/components/tickets/tickets-table";
import type { TenantTicketSummary } from "@/lib/api-client";
import { buildTicketsQuery } from "@/lib/api-client";
import { cn } from "@/lib/utils";

const QUERY_KEY = (id: string, q: Record<string, unknown>) =>
  ["tenant", id, "tickets", q] as const;

const DEFAULT_FILTERS: TicketsFilters = {
  status: [],
  search: "",
  unreadOnly: false,
};

async function getTickets(
  tenantId: string,
  query: Record<string, string | number | boolean | undefined>,
): Promise<{ tickets: TenantTicketSummary[] }> {
  const sp = new URLSearchParams();
  for (const [k, v] of Object.entries(query)) {
    if (v === undefined) continue;
    sp.set(k, String(v));
  }
  const res = await fetch(
    `/api/tenants/${tenantId}/tickets${sp.toString() ? `?${sp.toString()}` : ""}`,
    { cache: "no-store" },
  );
  if (!res.ok) {
    let body: { error?: string } = {};
    try {
      body = (await res.json()) as { error?: string };
    } catch {
      // ignore
    }
    throw new Error(body.error ?? `HTTP ${res.status}`);
  }
  return (await res.json()) as { tickets: TenantTicketSummary[] };
}

export function TicketsTab({
  tenantId,
  tenantName,
}: {
  tenantId: string;
  tenantName: string;
}) {
  const [filters, setFilters] = useState<TicketsFilters>(DEFAULT_FILTERS);

  const queryParams = useMemo(
    () => buildTicketsQuery(filters),
    [filters],
  );

  const { data, isLoading, isError, error, refetch, isFetching } = useQuery({
    queryKey: QUERY_KEY(tenantId, queryParams),
    queryFn: () => getTickets(tenantId, queryParams),
    refetchInterval: 30_000,
    refetchIntervalInBackground: false,
    staleTime: 15_000,
  });

  const rows = useMemo(
    () =>
      (data?.tickets ?? []).map((t) => ({
        ...t,
        tenantId,
        tenantName,
      })),
    [data, tenantId, tenantName],
  );

  return (
    <div className="space-y-4">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <div>
          <h2 className="text-base font-medium">Tickets de {tenantName}</h2>
          <p className="text-xs text-muted-foreground">
            {rows.length} ticket{rows.length === 1 ? "" : "s"} listados
          </p>
        </div>
        <Button
          size="sm"
          variant="outline"
          onClick={() => refetch()}
          disabled={isFetching}
        >
          <RotateCw className={cn("size-4", isFetching && "animate-spin")} />
          Refrescar
        </Button>
      </div>

      <TicketsFiltersBar filters={filters} onChange={setFilters} />

      {isLoading ? (
        <div className="space-y-2">
          {Array.from({ length: 4 }).map((_, i) => (
            <Skeleton key={i} className="h-10 w-full" />
          ))}
        </div>
      ) : isError ? (
        <ErrorState
          title="No se pudieron cargar los tickets"
          onRetry={() => refetch()}
          retrying={isFetching}
          technicalDetail={(error as Error)?.message}
        />
      ) : (
        <TicketsTable rows={rows} showTenant={false} />
      )}
    </div>
  );
}
