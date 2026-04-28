"use client";

import { useMemo, useState } from "react";
import {
  useMutation,
  useQuery,
  useQueryClient,
} from "@tanstack/react-query";
import {
  ArrowUpCircle,
  CheckCircle2,
  Database,
  HardHat,
  PlayCircle,
  RotateCw,
  Wrench,
  X,
} from "lucide-react";
import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Skeleton } from "@/components/ui/skeleton";
import { ErrorState } from "@/components/ui/error-state";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";
import { useToast } from "@/hooks/use-toast";
import {
  ActionConfirmDialog,
  type ConfirmPayload,
} from "@/components/tenant/action-confirm-dialog";
import {
  ActionExecutionDialog,
  ActionStatusBadge,
} from "@/components/tenant/action-execution-dialog";
import {
  ACTION_DESCRIPTIONS,
  ACTION_LABELS,
  type ActionType,
  type AdminAction,
  type MaintenanceStatus,
} from "@/lib/types/tenant-actions";
import {
  cn,
  formatDate,
  formatDuration,
  formatRelativeDate,
} from "@/lib/utils";

const ACTIONS_KEY = (id: string) => ["tenant", id, "actions"] as const;
const MAINTENANCE_KEY = (id: string) =>
  ["tenant", id, "maintenance"] as const;

type VisibleAction = {
  type: ActionType;
  icon: React.ComponentType<{ className?: string }>;
  destructive?: boolean;
};

/**
 * Render BOTH `maintenance_on` and `maintenance_off` regardless of what the
 * tenant currently reports — operators must always be able to force the off
 * state even if the GET /maintenance endpoint disagrees with reality
 * (e.g. the on/off action ran but the status query still says "off").
 */
const VISIBLE_ACTIONS: VisibleAction[] = [
  { type: "deploy", icon: ArrowUpCircle },
  { type: "restart_pm2", icon: RotateCw },
  { type: "backup_now", icon: Database },
  { type: "maintenance_on", icon: Wrench },
  { type: "maintenance_off", icon: Wrench, destructive: true },
];

type ConfirmState = {
  type: ActionType;
  maintenanceActive: boolean;
};

type ExecutionState = {
  actionId: string;
  readOnly?: boolean;
};

async function getJson<T>(url: string): Promise<T> {
  const res = await fetch(url, { cache: "no-store" });
  if (!res.ok) {
    let body: { error?: string } = {};
    try {
      body = (await res.json()) as { error?: string };
    } catch {
      // ignore
    }
    throw new Error(body.error ?? `HTTP ${res.status}`);
  }
  return (await res.json()) as T;
}

async function postJson<T>(url: string, body: unknown): Promise<T> {
  const res = await fetch(url, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(body),
  });
  if (!res.ok) {
    let parsed: { error?: string } = {};
    try {
      parsed = (await res.json()) as { error?: string };
    } catch {
      // ignore
    }
    throw new Error(parsed.error ?? `HTTP ${res.status}`);
  }
  return (await res.json()) as T;
}

export function ActionsTab({ tenantId }: { tenantId: string }) {
  const qc = useQueryClient();
  const { toast } = useToast();

  const maintenance = useQuery({
    queryKey: MAINTENANCE_KEY(tenantId),
    queryFn: () =>
      getJson<MaintenanceStatus>(`/api/tenants/${tenantId}/maintenance`),
    refetchInterval: 30_000,
    refetchIntervalInBackground: false,
    staleTime: 0,
  });

  const actions = useQuery({
    queryKey: ACTIONS_KEY(tenantId),
    queryFn: () =>
      getJson<{ actions: AdminAction[] }>(
        `/api/tenants/${tenantId}/actions?limit=20`,
      ),
    refetchInterval: 30_000,
    refetchIntervalInBackground: false,
    staleTime: 0,
  });

  const trigger = useMutation({
    mutationFn: (payload: ConfirmPayload) =>
      postJson<{ actionId: string; operationLogId: string; action: AdminAction }>(
        `/api/tenants/${tenantId}/actions`,
        payload,
      ),
    onSuccess: (data, payload) => {
      toast({
        title: `Acción iniciada · ${ACTION_LABELS[payload.type]}`,
      });
      // Optimistically tag maintenance as active when we just turned it on
      // (gets confirmed by next poll).
      if (payload.type === "maintenance_on") {
        qc.setQueryData<MaintenanceStatus>(
          MAINTENANCE_KEY(tenantId),
          (old) =>
            ({
              active: true,
              since: new Date().toISOString(),
              message:
                (payload.metadata?.message as string | undefined) ?? old?.message,
              expectedDurationMinutes:
                (payload.metadata?.expectedDurationMinutes as
                  | number
                  | undefined) ?? null,
            }),
        );
      }
      if (payload.type === "maintenance_off") {
        qc.setQueryData<MaintenanceStatus>(MAINTENANCE_KEY(tenantId), () => ({
          active: false,
        }));
      }
      // Refresh to capture the new history entry quickly.
      qc.invalidateQueries({ queryKey: ACTIONS_KEY(tenantId) });
      qc.invalidateQueries({ queryKey: MAINTENANCE_KEY(tenantId) });
      setExecution({ actionId: data.actionId });
    },
    onError: (err) => {
      toast({
        title: "No se pudo iniciar la acción",
        description: (err as Error).message,
        variant: "destructive",
      });
    },
  });

  const [confirmState, setConfirmState] = useState<ConfirmState | null>(null);
  const [execution, setExecution] = useState<ExecutionState | null>(null);

  const lastAction = useMemo(
    () => actions.data?.actions?.[0],
    [actions.data],
  );

  function startAction(type: ActionType) {
    setConfirmState({
      type,
      maintenanceActive: maintenance.data?.active ?? false,
    });
  }

  function handleConfirm(payload: ConfirmPayload) {
    trigger.mutate(payload, {
      onSettled: () => setConfirmState(null),
    });
  }

  return (
    <div className="space-y-6">
      <h2 className="text-base font-medium">Acciones</h2>

      <MaintenanceCard
        status={maintenance.data}
        isLoading={maintenance.isLoading}
        isError={maintenance.isError}
        error={maintenance.error as Error | undefined}
        onRetry={() => maintenance.refetch()}
        lastAction={lastAction}
        onMaintenanceOff={() => startAction("maintenance_off")}
      />

      <Card>
        <CardHeader className="pb-3">
          <CardTitle className="text-sm uppercase tracking-wide text-muted-foreground">
            Acciones disponibles
          </CardTitle>
        </CardHeader>
        <CardContent className="grid grid-cols-1 gap-3 sm:grid-cols-2">
          {VISIBLE_ACTIONS.map(({ type, icon: Icon, destructive }) => (
            <ActionCard
              key={type}
              type={type}
              icon={<Icon className="size-4" />}
              onClick={() => startAction(type)}
              disabled={trigger.isPending}
              destructive={destructive}
            />
          ))}
        </CardContent>
      </Card>

      <Card>
        <CardHeader className="flex flex-row items-center justify-between pb-3">
          <CardTitle className="text-sm uppercase tracking-wide text-muted-foreground">
            Historial reciente
          </CardTitle>
          <Button
            size="sm"
            variant="ghost"
            onClick={() => actions.refetch()}
            disabled={actions.isFetching}
          >
            <RotateCw
              className={cn("size-3.5", actions.isFetching && "animate-spin")}
            />
            Refrescar
          </Button>
        </CardHeader>
        <CardContent>
          <HistoryTable
            isLoading={actions.isLoading}
            isError={actions.isError}
            error={actions.error as Error | undefined}
            onRetry={() => actions.refetch()}
            actions={actions.data?.actions}
            onShowLogs={(actionId) =>
              setExecution({ actionId, readOnly: true })
            }
          />
        </CardContent>
      </Card>

      <ActionConfirmDialog
        state={confirmState}
        pending={trigger.isPending}
        onCancel={() => setConfirmState(null)}
        onConfirm={handleConfirm}
      />

      {execution ? (
        <ActionExecutionDialog
          tenantId={tenantId}
          actionId={execution.actionId}
          readOnly={execution.readOnly}
          onClose={() => setExecution(null)}
        />
      ) : null}
    </div>
  );
}

// ---------------------------------------------------------------------------

function MaintenanceCard({
  status,
  isLoading,
  isError,
  error,
  onRetry,
  lastAction,
  onMaintenanceOff,
}: {
  status: MaintenanceStatus | undefined;
  isLoading: boolean;
  isError: boolean;
  error: Error | undefined;
  onRetry: () => void;
  lastAction: AdminAction | undefined;
  onMaintenanceOff: () => void;
}) {
  return (
    <Card>
      <CardHeader className="pb-3">
        <CardTitle className="text-sm uppercase tracking-wide text-muted-foreground">
          Estado actual
        </CardTitle>
      </CardHeader>
      <CardContent className="space-y-3">
        {isLoading ? (
          <Skeleton className="h-5 w-72" />
        ) : isError ? (
          <ErrorState
            title="No se pudo leer el estado de mantenimiento"
            onRetry={onRetry}
            technicalDetail={error?.message}
          />
        ) : status?.active ? (
          <div className="flex flex-wrap items-center justify-between gap-2 rounded-md border border-amber-500/40 bg-amber-50/60 p-3 dark:bg-amber-950/20">
            <div className="flex items-center gap-2 text-sm">
              <span className="size-2 animate-pulse rounded-full bg-amber-500" />
              <span className="font-medium text-amber-900 dark:text-amber-200">
                Mantenimiento activo
              </span>
              {status.since ? (
                <span
                  className="text-xs text-amber-800/80 dark:text-amber-300/80"
                  title={formatDate(status.since)}
                >
                  desde {formatRelativeDate(status.since)}
                </span>
              ) : null}
              {status.message ? (
                <span className="text-xs italic text-muted-foreground">
                  · &ldquo;{status.message}&rdquo;
                </span>
              ) : null}
            </div>
            <Button size="sm" variant="outline" onClick={onMaintenanceOff}>
              <X className="size-4" />
              Desactivar
            </Button>
          </div>
        ) : (
          <div className="flex items-center gap-2 text-sm">
            <CheckCircle2 className="size-4 text-emerald-600" />
            <span className="text-muted-foreground">
              Cliente operativo, sin mantenimiento.
            </span>
          </div>
        )}

        <LastActionLine action={lastAction} />
      </CardContent>
    </Card>
  );
}

function LastActionLine({ action }: { action: AdminAction | undefined }) {
  if (!action) return null;
  return (
    <p className="text-xs text-muted-foreground">
      Última operación:{" "}
      <span className="font-mono text-foreground">{labelOf(action.type)}</span>{" "}
      {action.status === "completed"
        ? "completada"
        : action.status === "failed"
          ? "fallida"
          : action.status}{" "}
      {action.completedAt
        ? formatRelativeDate(action.completedAt)
        : action.startedAt
          ? `iniciada ${formatRelativeDate(action.startedAt)}`
          : ""}
      {action.durationMs ? ` · ${formatDuration(action.durationMs)}` : ""}
    </p>
  );
}

function ActionCard({
  type,
  icon,
  onClick,
  disabled,
  destructive,
}: {
  type: ActionType;
  icon: React.ReactNode;
  onClick: () => void;
  disabled: boolean;
  destructive?: boolean;
}) {
  return (
    <div
      className={cn(
        "flex flex-col gap-2 rounded-md border bg-card p-4",
        destructive && "border-amber-400/60 bg-amber-50/50 dark:bg-amber-950/10",
      )}
    >
      <div className="flex items-center gap-2 font-medium">
        <span
          className={cn(
            "grid size-7 place-items-center rounded text-muted-foreground",
            destructive
              ? "bg-amber-200/60 text-amber-900 dark:bg-amber-900/40 dark:text-amber-200"
              : "bg-muted",
          )}
        >
          {icon}
        </span>
        {ACTION_LABELS[type]}
      </div>
      <p className="text-xs text-muted-foreground">{ACTION_DESCRIPTIONS[type]}</p>
      <div className="mt-1">
        <Button
          size="sm"
          onClick={onClick}
          disabled={disabled}
          variant={destructive ? "outline" : "default"}
        >
          <PlayCircle className="size-4" />
          {destructive ? "Desactivar" : "Lanzar"}
        </Button>
      </div>
    </div>
  );
}

function HistoryTable({
  isLoading,
  isError,
  error,
  onRetry,
  actions,
  onShowLogs,
}: {
  isLoading: boolean;
  isError: boolean;
  error: Error | undefined;
  onRetry: () => void;
  actions: AdminAction[] | undefined;
  onShowLogs: (id: string) => void;
}) {
  if (isLoading) {
    return (
      <div className="space-y-2">
        {Array.from({ length: 4 }).map((_, i) => (
          <Skeleton key={i} className="h-7 w-full" />
        ))}
      </div>
    );
  }
  if (isError) {
    return (
      <ErrorState
        title="No se pudo cargar el historial de acciones"
        onRetry={onRetry}
        technicalDetail={error?.message}
      />
    );
  }
  if (!actions || actions.length === 0) {
    return (
      <p className="text-sm text-muted-foreground">
        Sin operaciones recientes en este cliente.
      </p>
    );
  }
  return (
    <Table>
      <TableHeader>
        <TableRow>
          <TableHead>Tipo</TableHead>
          <TableHead>Estado</TableHead>
          <TableHead>Cuándo</TableHead>
          <TableHead>Duración</TableHead>
          <TableHead className="text-right" />
        </TableRow>
      </TableHeader>
      <TableBody>
        {actions.map((a) => (
          <TableRow key={a.id}>
            <TableCell className="font-mono text-xs" title={labelOf(a.type)}>
              {a.type}
            </TableCell>
            <TableCell>
              <ActionStatusBadge status={a.status} />
            </TableCell>
            <TableCell
              className="whitespace-nowrap text-xs text-muted-foreground"
              title={
                a.completedAt
                  ? formatDate(a.completedAt)
                  : a.startedAt
                    ? formatDate(a.startedAt)
                    : formatDate(a.createdAt)
              }
            >
              {formatRelativeDate(a.completedAt ?? a.startedAt ?? a.createdAt)}
            </TableCell>
            <TableCell className="text-xs text-muted-foreground">
              {a.durationMs !== undefined ? formatDuration(a.durationMs) : "—"}
            </TableCell>
            <TableCell className="text-right">
              <Button
                size="sm"
                variant="ghost"
                onClick={() => onShowLogs(a.id)}
              >
                Ver logs
              </Button>
            </TableCell>
          </TableRow>
        ))}
      </TableBody>
    </Table>
  );
}

function labelOf(type: string): string {
  return (ACTION_LABELS as Record<string, string>)[type] ?? type;
}
