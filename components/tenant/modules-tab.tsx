"use client";

import { useEffect, useMemo, useState } from "react";
import {
  useMutation,
  useQuery,
  useQueryClient,
} from "@tanstack/react-query";
import {
  AlertTriangle,
  CircleMinus,
  CirclePlus,
  Settings,
  RotateCw,
  Lock,
} from "lucide-react";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Switch } from "@/components/ui/switch";
import { Skeleton } from "@/components/ui/skeleton";
import { Alert, AlertDescription, AlertTitle } from "@/components/ui/alert";
import { Separator } from "@/components/ui/separator";
import { Textarea } from "@/components/ui/textarea";
import {
  Tooltip,
  TooltipContent,
  TooltipTrigger,
} from "@/components/ui/tooltip";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { ErrorState } from "@/components/ui/error-state";
import { useToast } from "@/hooks/use-toast";
import {
  MODULE_CATEGORIES,
  MODULE_CATEGORY_LABEL,
  type ModuleAuditEvent,
  type ModuleInfo,
  type ModuleCategory,
} from "@/lib/types/tenant-modules";
import { cn, formatRelativeDate } from "@/lib/utils";

const MODULES_QUERY_KEY = (id: string) => ["tenant", id, "modules"] as const;
const AUDIT_QUERY_KEY = (id: string) => ["tenant", id, "modules", "audit"] as const;
const REASON_SKIP_STORAGE_KEY = "mercantia_skip_reason_dialog";
const OFFLINE_THRESHOLD_MS = 30_000;

type ModulesResponse = { modules: ModuleInfo[] };
type AuditResponse = { events: ModuleAuditEvent[] };

async function getJson<T>(url: string): Promise<T> {
  const res = await fetch(url, { cache: "no-store" });
  if (!res.ok) {
    let body: { error?: string } = {};
    try {
      body = (await res.json()) as { error?: string };
    } catch {
      // ignore
    }
    const err = new Error(body.error ?? `HTTP ${res.status}`);
    (err as Error & { status?: number }).status = res.status;
    throw err;
  }
  return (await res.json()) as T;
}

type ToggleArgs = { module: string; enabled: boolean; reason?: string };

async function postToggle(
  tenantId: string,
  args: ToggleArgs,
): Promise<{ ok: true } | never> {
  const res = await fetch(`/api/tenants/${tenantId}/modules`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(args),
  });
  if (res.ok) return { ok: true };
  let body: { error?: string; code?: string | null } = {};
  try {
    body = (await res.json()) as typeof body;
  } catch {
    // ignore
  }
  const err = new Error(body.error ?? `HTTP ${res.status}`) as Error & {
    code?: string;
    status?: number;
  };
  err.code = body.code ?? undefined;
  err.status = res.status;
  throw err;
}

// ---------------------------------------------------------------------------

export function ModulesTab({ tenantId }: { tenantId: string }) {
  const qc = useQueryClient();
  const { toast } = useToast();

  const modulesQuery = useQuery({
    queryKey: MODULES_QUERY_KEY(tenantId),
    queryFn: () => getJson<ModulesResponse>(`/api/tenants/${tenantId}/modules`),
    staleTime: 30_000,
    refetchOnWindowFocus: true,
  });

  const auditQuery = useQuery({
    queryKey: AUDIT_QUERY_KEY(tenantId),
    queryFn: () =>
      getJson<AuditResponse>(`/api/tenants/${tenantId}/modules/audit`),
    staleTime: 30_000,
    refetchOnWindowFocus: true,
  });

  const moduleByName = useMemo(() => {
    const m = new Map<string, ModuleInfo>();
    for (const mod of modulesQuery.data?.modules ?? []) m.set(mod.name, mod);
    return m;
  }, [modulesQuery.data]);

  const grouped = useMemo(() => {
    const map = new Map<ModuleCategory, ModuleInfo[]>();
    for (const cat of MODULE_CATEGORIES) map.set(cat, []);
    for (const m of modulesQuery.data?.modules ?? []) {
      const list = map.get(m.category) ?? [];
      list.push(m);
      map.set(m.category, list);
    }
    return map;
  }, [modulesQuery.data]);

  const toggleMutation = useMutation({
    mutationFn: (args: ToggleArgs) => postToggle(tenantId, args),
    onMutate: async (args) => {
      await qc.cancelQueries({ queryKey: MODULES_QUERY_KEY(tenantId) });
      const previous = qc.getQueryData<ModulesResponse>(
        MODULES_QUERY_KEY(tenantId),
      );
      qc.setQueryData<ModulesResponse>(MODULES_QUERY_KEY(tenantId), (old) =>
        old
          ? {
              ...old,
              modules: old.modules.map((m) =>
                m.name === args.module ? { ...m, enabled: args.enabled } : m,
              ),
            }
          : old,
      );
      return { previous };
    },
    onError: (err, args, ctx) => {
      if (ctx?.previous) {
        qc.setQueryData(MODULES_QUERY_KEY(tenantId), ctx.previous);
      }
      const e = err as Error & { code?: string };
      const mod = moduleByName.get(args.module);
      const label = mod?.label ?? args.module;
      if (e.code === "DEPENDENCY_BLOCK") {
        // Will be surfaced via dialog opened by the caller of mutate().
        // Toast is suppressed for dependency blocks because the dialog
        // already explains the problem.
        return;
      }
      toast({
        title: `No se pudo ${args.enabled ? "activar" : "desactivar"} ${label}`,
        description: e.message,
        variant: "destructive",
      });
    },
    onSuccess: (_data, args) => {
      const mod = moduleByName.get(args.module);
      const label = mod?.label ?? args.module;
      toast({
        title: `Módulo ${label} ${args.enabled ? "activado" : "desactivado"}`,
      });
    },
    onSettled: () => {
      qc.invalidateQueries({ queryKey: MODULES_QUERY_KEY(tenantId) });
      qc.invalidateQueries({ queryKey: AUDIT_QUERY_KEY(tenantId) });
    },
  });

  // ----- pending dialogs ------------------------------------------------

  const [reasonDialog, setReasonDialog] = useState<null | {
    module: ModuleInfo;
    nextEnabled: boolean;
  }>(null);

  const [dependencyDialog, setDependencyDialog] = useState<null | {
    module: ModuleInfo;
    blockers: string[];
    serverMessage?: string;
  }>(null);

  function startToggle(module: ModuleInfo, nextEnabled: boolean) {
    if (module.alwaysOn) return;

    // Disabling: check if any dependents are currently enabled.
    if (!nextEnabled) {
      const blockers = module.dependents.filter(
        (name) => moduleByName.get(name)?.enabled,
      );
      if (blockers.length > 0) {
        setDependencyDialog({ module, blockers });
        return;
      }
    }

    if (shouldSkipReason()) {
      runToggle(module, nextEnabled, undefined);
      return;
    }
    setReasonDialog({ module, nextEnabled });
  }

  function runToggle(
    module: ModuleInfo,
    nextEnabled: boolean,
    reason: string | undefined,
  ) {
    toggleMutation.mutate(
      { module: module.name, enabled: nextEnabled, reason },
      {
        onError: (err) => {
          const e = err as Error & { code?: string };
          if (e.code === "DEPENDENCY_BLOCK") {
            setDependencyDialog({
              module,
              blockers: module.dependents.filter(
                (n) => moduleByName.get(n)?.enabled,
              ),
              serverMessage: e.message,
            });
          }
        },
      },
    );
  }

  function refresh() {
    modulesQuery.refetch();
    auditQuery.refetch();
  }

  // ----- offline detection ----------------------------------------------

  const showOffline =
    modulesQuery.isError &&
    Date.now() - modulesQuery.errorUpdatedAt > OFFLINE_THRESHOLD_MS &&
    modulesQuery.errorUpdatedAt > 0;

  const offlineSince =
    modulesQuery.dataUpdatedAt > 0
      ? new Date(modulesQuery.dataUpdatedAt)
      : modulesQuery.errorUpdatedAt > 0
        ? new Date(modulesQuery.errorUpdatedAt)
        : null;

  // ----------------------------------------------------------------------

  return (
    <div className="space-y-6">
      <div className="flex items-center justify-between">
        <h2 className="text-base font-medium">Módulos del cliente</h2>
        <Button
          size="sm"
          variant="outline"
          onClick={refresh}
          disabled={modulesQuery.isFetching || auditQuery.isFetching}
        >
          <RotateCw
            className={cn(
              "size-4",
              (modulesQuery.isFetching || auditQuery.isFetching) &&
                "animate-spin",
            )}
          />
          Refrescar
        </Button>
      </div>

      {showOffline ? (
        <Alert variant="warning">
          <AlertTriangle className="size-4" />
          <AlertTitle>Cliente no responde</AlertTitle>
          <AlertDescription>
            Último contacto{" "}
            {offlineSince ? formatRelativeDate(offlineSince) : "desconocido"}.
            Los datos pueden no estar al día.
          </AlertDescription>
        </Alert>
      ) : null}

      {modulesQuery.isLoading ? (
        <ModulesSkeleton />
      ) : modulesQuery.isError ? (
        <ErrorState
          title="No se pudo conectar con este cliente."
          description="Verifica que la API admin esté disponible y el token sea correcto."
          onRetry={() => modulesQuery.refetch()}
          retrying={modulesQuery.isFetching}
          technicalDetail={(modulesQuery.error as Error)?.message}
        />
      ) : (
        <div className="space-y-4">
          {MODULE_CATEGORIES.map((cat) => {
            const items = grouped.get(cat) ?? [];
            if (items.length === 0) return null;
            return (
              <CategoryCard
                key={cat}
                category={cat}
                modules={items}
                onToggle={startToggle}
                disabled={toggleMutation.isPending}
              />
            );
          })}
        </div>
      )}

      <Separator />

      <AuditSection
        events={auditQuery.data?.events}
        isLoading={auditQuery.isLoading}
        isError={auditQuery.isError}
        error={auditQuery.error as Error | undefined}
        onRetry={() => auditQuery.refetch()}
      />

      <ReasonDialog
        state={reasonDialog}
        onCancel={() => setReasonDialog(null)}
        onConfirm={(reason, skipNext) => {
          if (!reasonDialog) return;
          if (skipNext) markSkipReason();
          runToggle(reasonDialog.module, reasonDialog.nextEnabled, reason);
          setReasonDialog(null);
        }}
      />

      <DependencyDialog
        state={dependencyDialog}
        onClose={() => setDependencyDialog(null)}
        moduleByName={moduleByName}
      />
    </div>
  );
}

// ---------------------------------------------------------------------------
// Category card
// ---------------------------------------------------------------------------

function CategoryCard({
  category,
  modules,
  onToggle,
  disabled,
}: {
  category: ModuleCategory;
  modules: ModuleInfo[];
  onToggle: (m: ModuleInfo, next: boolean) => void;
  disabled: boolean;
}) {
  return (
    <Card>
      <CardHeader className="pb-3">
        <CardTitle className="text-sm uppercase tracking-wide text-muted-foreground">
          {MODULE_CATEGORY_LABEL[category]}
        </CardTitle>
      </CardHeader>
      <CardContent className="space-y-1">
        {modules.map((m) => (
          <ModuleRow
            key={m.name}
            module={m}
            onToggle={onToggle}
            disabled={disabled}
          />
        ))}
      </CardContent>
    </Card>
  );
}

function ModuleRow({
  module,
  onToggle,
  disabled,
}: {
  module: ModuleInfo;
  onToggle: (m: ModuleInfo, next: boolean) => void;
  disabled: boolean;
}) {
  const dot = module.alwaysOn
    ? "bg-slate-400"
    : module.enabled
      ? "bg-emerald-500"
      : "bg-slate-300 dark:bg-slate-600";

  const row = (
    <div className="flex items-center justify-between gap-3 rounded-md px-2 py-2 transition-colors hover:bg-muted/40">
      <div className="flex items-center gap-3 min-w-0">
        <span className={cn("size-2 shrink-0 rounded-full", dot)} />
        <div className="min-w-0">
          <div className="flex items-center gap-2">
            <span className="text-sm font-medium truncate">{module.label}</span>
            <span className="font-mono text-[11px] text-muted-foreground truncate">
              {module.name}
            </span>
          </div>
          {module.description ? (
            <p className="text-xs text-muted-foreground truncate">
              {module.description}
            </p>
          ) : null}
        </div>
      </div>
      <div className="shrink-0">
        {module.alwaysOn ? (
          <Badge variant="muted" className="gap-1">
            <Lock className="size-3" />
            Siempre activo
          </Badge>
        ) : (
          <Switch
            checked={module.enabled}
            onCheckedChange={(checked) => onToggle(module, checked)}
            disabled={disabled}
            aria-label={`${module.enabled ? "Desactivar" : "Activar"} ${module.label}`}
          />
        )}
      </div>
    </div>
  );

  if (!module.description && module.dependsOn.length === 0) return row;

  return (
    <Tooltip>
      <TooltipTrigger asChild>
        <div>{row}</div>
      </TooltipTrigger>
      <TooltipContent side="left" className="max-w-sm">
        <div className="space-y-1 text-xs">
          {module.description ? <div>{module.description}</div> : null}
          {module.dependsOn.length > 0 ? (
            <div className="text-muted-foreground">
              Depende de:{" "}
              <span className="font-mono">{module.dependsOn.join(", ")}</span>
            </div>
          ) : null}
          {module.dependents.length > 0 ? (
            <div className="text-muted-foreground">
              Requerido por:{" "}
              <span className="font-mono">{module.dependents.join(", ")}</span>
            </div>
          ) : null}
        </div>
      </TooltipContent>
    </Tooltip>
  );
}

// ---------------------------------------------------------------------------
// Audit log
// ---------------------------------------------------------------------------

function AuditSection({
  events,
  isLoading,
  isError,
  error,
  onRetry,
}: {
  events: ModuleAuditEvent[] | undefined;
  isLoading: boolean;
  isError: boolean;
  error?: Error;
  onRetry: () => void;
}) {
  return (
    <div>
      <h3 className="mb-3 text-sm font-medium">Historial de cambios</h3>
      {isLoading ? (
        <div className="space-y-2">
          {Array.from({ length: 4 }).map((_, i) => (
            <Skeleton key={i} className="h-5 w-full" />
          ))}
        </div>
      ) : isError ? (
        <ErrorState
          title="No se pudo cargar el historial."
          onRetry={onRetry}
          technicalDetail={error?.message}
        />
      ) : !events || events.length === 0 ? (
        <p className="text-sm text-muted-foreground">
          Sin eventos de módulos registrados en el cliente.
        </p>
      ) : (
        <ul className="space-y-1.5">
          {events.map((e) => (
            <li
              key={String(e.id)}
              className="flex items-start gap-2 text-sm text-muted-foreground"
            >
              <ActionIcon action={e.action} />
              <span className="whitespace-nowrap text-xs tabular-nums">
                {formatRelativeDate(e.createdAt)}
              </span>
              <span className="flex-1">
                <span className="text-foreground">
                  {e.performedBy ?? "admin"}
                </span>{" "}
                {actionVerb(e.action)}{" "}
                <span className="font-mono text-foreground">
                  {e.module}
                </span>
                {e.reason ? (
                  <>
                    {" "}
                    <span className="text-muted-foreground">— {e.reason}</span>
                  </>
                ) : null}
              </span>
            </li>
          ))}
        </ul>
      )}
    </div>
  );
}

function ActionIcon({ action }: { action: ModuleAuditEvent["action"] }) {
  if (action === "enabled")
    return <CirclePlus className="mt-0.5 size-3.5 shrink-0 text-emerald-600" />;
  if (action === "disabled")
    return <CircleMinus className="mt-0.5 size-3.5 shrink-0 text-red-600" />;
  return <Settings className="mt-0.5 size-3.5 shrink-0 text-sky-600" />;
}

function actionVerb(a: ModuleAuditEvent["action"]) {
  if (a === "enabled") return "activó";
  if (a === "disabled") return "desactivó";
  return "configuró";
}

// ---------------------------------------------------------------------------
// Skeletons & dialogs
// ---------------------------------------------------------------------------

function ModulesSkeleton() {
  return (
    <div className="space-y-4">
      {[0, 1, 2].map((i) => (
        <Card key={i}>
          <CardHeader className="pb-3">
            <Skeleton className="h-3 w-24" />
          </CardHeader>
          <CardContent className="space-y-3">
            {[0, 1, 2, 3].map((j) => (
              <div key={j} className="flex items-center justify-between">
                <div className="flex items-center gap-3">
                  <Skeleton className="size-2 rounded-full" />
                  <Skeleton className="h-4 w-40" />
                </div>
                <Skeleton className="h-6 w-11 rounded-full" />
              </div>
            ))}
          </CardContent>
        </Card>
      ))}
    </div>
  );
}

function shouldSkipReason() {
  if (typeof window === "undefined") return false;
  return window.sessionStorage.getItem(REASON_SKIP_STORAGE_KEY) === "1";
}

function markSkipReason() {
  if (typeof window === "undefined") return;
  window.sessionStorage.setItem(REASON_SKIP_STORAGE_KEY, "1");
}

function ReasonDialog({
  state,
  onCancel,
  onConfirm,
}: {
  state: { module: ModuleInfo; nextEnabled: boolean } | null;
  onCancel: () => void;
  onConfirm: (reason: string | undefined, skipNext: boolean) => void;
}) {
  const [reason, setReason] = useState("");
  const [skip, setSkip] = useState(false);

  useEffect(() => {
    if (state) {
      setReason("");
      setSkip(false);
    }
  }, [state]);

  if (!state) return null;
  const verb = state.nextEnabled ? "activar" : "desactivar";

  return (
    <Dialog open onOpenChange={(open) => !open && onCancel()}>
      <DialogContent>
        <DialogHeader>
          <DialogTitle>
            ¿{verb.charAt(0).toUpperCase() + verb.slice(1)} {state.module.label}?
          </DialogTitle>
          <DialogDescription>
            Puedes añadir un motivo para que quede registrado en el audit log.
          </DialogDescription>
        </DialogHeader>
        <Textarea
          placeholder="Motivo del cambio (opcional)"
          rows={3}
          maxLength={500}
          value={reason}
          onChange={(e) => setReason(e.target.value)}
          autoFocus
        />
        <label className="flex items-center gap-2 text-xs text-muted-foreground">
          <input
            type="checkbox"
            className="size-4 accent-current"
            checked={skip}
            onChange={(e) => setSkip(e.target.checked)}
          />
          No volver a preguntar en esta sesión
        </label>
        <DialogFooter>
          <Button variant="ghost" onClick={onCancel}>
            Cancelar
          </Button>
          <Button onClick={() => onConfirm(reason.trim() || undefined, skip)}>
            Confirmar
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}

function DependencyDialog({
  state,
  onClose,
  moduleByName,
}: {
  state:
    | { module: ModuleInfo; blockers: string[]; serverMessage?: string }
    | null;
  onClose: () => void;
  moduleByName: Map<string, ModuleInfo>;
}) {
  if (!state) return null;
  return (
    <Dialog open onOpenChange={(open) => !open && onClose()}>
      <DialogContent>
        <DialogHeader>
          <DialogTitle>
            No se puede desactivar {state.module.label}
          </DialogTitle>
          <DialogDescription>
            Otros módulos activos dependen de éste. Desactívalos primero o este
            cambio dejaría el sistema inconsistente.
          </DialogDescription>
        </DialogHeader>
        <ul className="space-y-1 rounded-md border bg-muted/40 p-3 text-sm">
          {state.blockers.map((name) => {
            const mod = moduleByName.get(name);
            return (
              <li
                key={name}
                className="flex items-center justify-between gap-2"
              >
                <span>{mod?.label ?? name}</span>
                <span className="font-mono text-xs text-muted-foreground">
                  {name}
                </span>
              </li>
            );
          })}
        </ul>
        {state.serverMessage ? (
          <p className="text-xs text-muted-foreground">
            Mensaje del cliente: {state.serverMessage}
          </p>
        ) : null}
        <DialogFooter>
          <Button onClick={onClose}>Entendido</Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
