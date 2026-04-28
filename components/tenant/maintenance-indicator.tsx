"use client";

import { useQuery } from "@tanstack/react-query";
import { Wrench } from "lucide-react";
import { Badge } from "@/components/ui/badge";
import {
  Tooltip,
  TooltipContent,
  TooltipTrigger,
} from "@/components/ui/tooltip";
import type { MaintenanceStatus } from "@/lib/types/tenant-actions";
import { formatRelativeDate } from "@/lib/utils";

async function getMaintenance(tenantId: string): Promise<MaintenanceStatus> {
  const res = await fetch(`/api/tenants/${tenantId}/maintenance`, {
    cache: "no-store",
  });
  if (!res.ok) {
    throw new Error(`HTTP ${res.status}`);
  }
  return (await res.json()) as MaintenanceStatus;
}

export function MaintenanceIndicator({ tenantId }: { tenantId: string }) {
  const { data, isError } = useQuery({
    queryKey: ["tenant", tenantId, "maintenance"],
    queryFn: () => getMaintenance(tenantId),
    staleTime: 60_000,
    refetchInterval: 5 * 60_000,
    refetchIntervalInBackground: false,
    retry: 0,
  });

  if (isError || !data?.active) return null;

  return (
    <Tooltip>
      <TooltipTrigger asChild>
        <Badge variant="warning" className="gap-1">
          <Wrench className="size-3" />
          Mantenimiento
        </Badge>
      </TooltipTrigger>
      <TooltipContent side="top">
        <div className="space-y-0.5 text-xs">
          <div className="font-medium">Modo mantenimiento activo</div>
          {data.since ? (
            <div className="text-muted-foreground">
              desde {formatRelativeDate(data.since)}
            </div>
          ) : null}
          {data.message ? (
            <div className="text-muted-foreground">&ldquo;{data.message}&rdquo;</div>
          ) : null}
        </div>
      </TooltipContent>
    </Tooltip>
  );
}
