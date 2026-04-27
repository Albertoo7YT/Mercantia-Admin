"use client";

import { useQuery } from "@tanstack/react-query";
import {
  Tooltip,
  TooltipContent,
  TooltipTrigger,
} from "@/components/ui/tooltip";
import { cn, formatRelativeDate } from "@/lib/utils";

type HealthApiResponse =
  | {
      ok: true;
      status: string;
      version: string;
      timestamp: string;
      responseMs: number;
    }
  | {
      ok: false;
      error: string;
      responseMs: number;
    };

type Color = "green" | "yellow" | "red" | "gray";

const COLOR_CLASS: Record<Color, string> = {
  green: "bg-emerald-500",
  yellow: "bg-amber-500",
  red: "bg-red-500",
  gray: "bg-slate-300 dark:bg-slate-600",
};

const COLOR_PULSE: Record<Color, string> = {
  green: "bg-emerald-400",
  yellow: "bg-amber-400",
  red: "bg-red-400",
  gray: "bg-slate-300 dark:bg-slate-600",
};

const LABEL: Record<Color, string> = {
  green: "Saludable",
  yellow: "Lento / degradado",
  red: "Caído",
  gray: "Comprobando…",
};

function classify(data: HealthApiResponse | undefined): Color {
  if (!data) return "gray";
  if (!data.ok) return "red";
  if (data.status !== "ok" || data.responseMs > 2000) return "yellow";
  return "green";
}

async function getHealth(tenantId: string): Promise<HealthApiResponse> {
  const res = await fetch(`/api/tenants/${tenantId}/health`, {
    cache: "no-store",
  });
  if (!res.ok) {
    return { ok: false, error: `HTTP ${res.status}`, responseMs: 0 };
  }
  return (await res.json()) as HealthApiResponse;
}

type Props = {
  tenantId: string;
  showLabel?: boolean;
  size?: "sm" | "md";
  className?: string;
};

export function HealthIndicator({
  tenantId,
  showLabel = true,
  size = "md",
  className,
}: Props) {
  const { data, isFetching, dataUpdatedAt, refetch } = useQuery({
    queryKey: ["tenant", tenantId, "health"],
    queryFn: () => getHealth(tenantId),
    refetchInterval: 30_000,
    refetchOnWindowFocus: true,
    staleTime: 0,
  });

  const color = classify(data);
  const dotSize = size === "sm" ? "size-2" : "size-2.5";

  return (
    <Tooltip>
      <TooltipTrigger asChild>
        <button
          type="button"
          onClick={() => refetch()}
          className={cn(
            "inline-flex items-center gap-2 text-sm",
            "focus:outline-none focus-visible:ring-2 focus-visible:ring-ring rounded",
            className,
          )}
          aria-label={LABEL[color]}
        >
          <span className="relative inline-flex">
            <span
              className={cn(
                "block rounded-full",
                dotSize,
                COLOR_CLASS[color],
              )}
            />
            {color !== "gray" ? (
              <span
                className={cn(
                  "absolute inset-0 inline-flex rounded-full opacity-75 animate-ping",
                  COLOR_PULSE[color],
                )}
                aria-hidden="true"
              />
            ) : null}
          </span>
          {showLabel ? (
            <span className="text-muted-foreground">
              {data && data.ok && color === "green"
                ? `OK · ${data.responseMs}ms`
                : data && data.ok
                  ? `${data.status} · ${data.responseMs}ms`
                  : data && !data.ok
                    ? "Sin conexión"
                    : isFetching
                      ? "Comprobando…"
                      : "Sin datos"}
            </span>
          ) : null}
        </button>
      </TooltipTrigger>
      <TooltipContent side="bottom">
        <HealthTooltip data={data} dataUpdatedAt={dataUpdatedAt} color={color} />
      </TooltipContent>
    </Tooltip>
  );
}

function HealthTooltip({
  data,
  dataUpdatedAt,
  color,
}: {
  data: HealthApiResponse | undefined;
  dataUpdatedAt: number;
  color: Color;
}) {
  if (!data) {
    return <div className="text-xs">{LABEL[color]}</div>;
  }
  return (
    <div className="space-y-0.5 text-xs">
      <div className="font-medium">{LABEL[color]}</div>
      {data.ok ? (
        <>
          <div className="text-muted-foreground">
            Status: <span className="font-mono">{data.status}</span>
          </div>
          {data.version ? (
            <div className="text-muted-foreground">
              Versión: <span className="font-mono">{data.version}</span>
            </div>
          ) : null}
          <div className="text-muted-foreground">
            Latencia: {data.responseMs}ms
          </div>
        </>
      ) : (
        <div className="text-muted-foreground break-words">
          Error: {data.error}
        </div>
      )}
      <div className="text-muted-foreground">
        Último ping {formatRelativeDate(dataUpdatedAt)}
      </div>
    </div>
  );
}
