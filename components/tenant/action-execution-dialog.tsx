"use client";

import { useEffect, useRef, useState } from "react";
import { useQuery } from "@tanstack/react-query";
import { AlertTriangle, CheckCircle2, Loader2, X } from "lucide-react";
import {
  Dialog,
  DialogContent,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { Alert, AlertDescription, AlertTitle } from "@/components/ui/alert";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Skeleton } from "@/components/ui/skeleton";
import {
  ACTION_LABELS,
  isTerminalStatus,
  type ActionLogChunk,
  type ActionType,
  type AdminAction,
} from "@/lib/types/tenant-actions";
import { cn, formatDuration } from "@/lib/utils";
import { useToast } from "@/hooks/use-toast";

const STATUS_POLL_INTERVAL_MS = 1_000;
const LOGS_POLL_INTERVAL_MS = 1_000;
const TERMINAL_LOGS_GRACE_MS = 1_500;
/** When the action stays "running" past this, we surface a warning banner. */
const STUCK_WARNING_AFTER_MS = 30_000;
/** Hard ceiling: stop polling after this so we don't pound the tenant forever. */
const HARD_STOP_AFTER_MS = 5 * 60_000;
/**
 * Hard cap on the in-memory log buffer. Protects the UI from runaway action
 * loops on the tenant side (e.g. a PM2 restart that crashes and reboots in a
 * tight loop) — without this the dialog would keep accumulating thousands of
 * identical lines and eventually freeze the browser tab.
 */
const MAX_LOG_LINES = 5_000;

type Props = {
  tenantId: string;
  actionId: string;
  /** When true, do not poll (read-only viewer of a finished action). */
  readOnly?: boolean;
  onClose: () => void;
};

async function fetchStatus(
  tenantId: string,
  actionId: string,
  signal: AbortSignal,
): Promise<AdminAction> {
  const res = await fetch(`/api/tenants/${tenantId}/actions/${actionId}`, {
    cache: "no-store",
    signal,
  });
  if (!res.ok) {
    let body: { error?: string } = {};
    try {
      body = (await res.json()) as { error?: string };
    } catch {
      // ignore
    }
    throw new Error(body.error ?? `HTTP ${res.status}`);
  }
  return (await res.json()) as AdminAction;
}

async function fetchLogs(
  tenantId: string,
  actionId: string,
  fromLine: number,
): Promise<ActionLogChunk> {
  const res = await fetch(
    `/api/tenants/${tenantId}/actions/${actionId}/logs?fromLine=${fromLine}`,
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
  return (await res.json()) as ActionLogChunk;
}

export function ActionExecutionDialog({
  tenantId,
  actionId,
  readOnly = false,
  onClose,
}: Props) {
  const { toast } = useToast();
  const [lines, setLines] = useState<string[]>([]);
  const cursorRef = useRef(0);
  const finalToastRef = useRef(false);
  const [hardStopped, setHardStopped] = useState(false);

  const status = useQuery({
    queryKey: ["tenant", tenantId, "action", actionId, "status"],
    queryFn: ({ signal }) => fetchStatus(tenantId, actionId, signal),
    refetchInterval: (q) => {
      if (readOnly || hardStopped) return false;
      const data = q.state.data;
      if (!data) return STATUS_POLL_INTERVAL_MS;
      return isTerminalStatus(data.status) ? false : STATUS_POLL_INTERVAL_MS;
    },
    refetchIntervalInBackground: false,
  });

  // Toast on first transition to a terminal state.
  useEffect(() => {
    const action = status.data;
    if (!action) return;
    if (finalToastRef.current) return;
    if (!isTerminalStatus(action.status)) return;
    finalToastRef.current = true;
    if (action.status === "completed") {
      toast({
        title: `Acción completada · ${labelOf(action.type)}`,
        description: action.durationMs
          ? `Duración: ${formatDuration(action.durationMs)}`
          : undefined,
      });
    } else {
      toast({
        title: `Acción fallida · ${labelOf(action.type)}`,
        description: action.errorMessage ?? "Sin mensaje",
        variant: "destructive",
      });
    }
  }, [status.data, toast]);

  // Manual log polling. We don't use useQuery here because we want to append
  // incrementally rather than replace, and use a ref-tracked cursor.
  const pollStartedAt = useRef<number>(Date.now());

  useEffect(() => {
    let cancelled = false;
    let timer: ReturnType<typeof setTimeout> | null = null;
    let consecutiveErrors = 0;
    pollStartedAt.current = Date.now();

    async function tick() {
      if (cancelled) return;

      // Hard stop after HARD_STOP_AFTER_MS so we don't pound the tenant forever
      // when an action is stuck (e.g. PM2 restart loop). The user can still
      // close the dialog manually.
      if (Date.now() - pollStartedAt.current > HARD_STOP_AFTER_MS) {
        setHardStopped(true);
        return;
      }

      if (typeof document !== "undefined" && document.hidden) {
        timer = setTimeout(tick, LOGS_POLL_INTERVAL_MS);
        return;
      }
      try {
        const data = await fetchLogs(tenantId, actionId, cursorRef.current);
        if (cancelled) return;

        // Only append + advance cursor when the tenant actually progressed.
        // If the cursor doesn't move, the tenant's logs endpoint is broken or
        // stuck; appending the same lines on every tick would spam the buffer.
        if (data.nextLine > cursorRef.current) {
          if (data.lines.length > 0) {
            setLines((prev) => {
              const next = [...prev, ...data.lines];
              if (next.length > MAX_LOG_LINES) {
                return next.slice(next.length - MAX_LOG_LINES);
              }
              return next;
            });
          }
          cursorRef.current = data.nextLine;
        }
        consecutiveErrors = 0;

        if (readOnly) return; // single fetch in read-only

        const s = status.data?.status;
        const terminal = s ? isTerminalStatus(s) : false;
        if (terminal && data.done) return;
        if (terminal) {
          // Allow a brief grace period to drain remaining lines.
          timer = setTimeout(tick, TERMINAL_LOGS_GRACE_MS);
          return;
        }
        timer = setTimeout(tick, LOGS_POLL_INTERVAL_MS);
      } catch {
        if (cancelled) return;
        consecutiveErrors += 1;
        if (consecutiveErrors > 5) return;
        timer = setTimeout(tick, LOGS_POLL_INTERVAL_MS * 2);
      }
    }

    tick();
    return () => {
      cancelled = true;
      if (timer) clearTimeout(timer);
    };
  }, [tenantId, actionId, readOnly, status.data?.status]);

  // Auto-scroll to bottom when new lines arrive.
  const scrollRef = useRef<HTMLPreElement | null>(null);
  useEffect(() => {
    const el = scrollRef.current;
    if (!el) return;
    const distanceFromBottom = el.scrollHeight - el.scrollTop - el.clientHeight;
    if (distanceFromBottom < 100) {
      el.scrollTop = el.scrollHeight;
    }
  }, [lines]);

  const action = status.data;
  const title = action ? labelOf(action.type) : "Cargando…";

  // Heuristic "this is stuck" detection: action is still running, started a
  // while ago, and we're not in read-only mode.
  const elapsedMs = action?.startedAt
    ? Date.now() - new Date(action.startedAt).getTime()
    : 0;
  const isRunning = action ? !isTerminalStatus(action.status) : false;
  const looksStuck =
    !readOnly && isRunning && elapsedMs > STUCK_WARNING_AFTER_MS;

  return (
    <Dialog open onOpenChange={(open) => !open && onClose()}>
      <DialogContent className="max-w-3xl">
        <DialogHeader>
          <DialogTitle className="flex items-center gap-3">
            <span>{`Ejecutando: ${title}`}</span>
            {action ? <StatusBadge status={action.status} /> : null}
          </DialogTitle>
        </DialogHeader>

        {hardStopped ? (
          <Alert variant="destructive">
            <AlertTriangle className="size-4" />
            <AlertTitle>Polling detenido</AlertTitle>
            <AlertDescription>
              La acción lleva más de 5 minutos ejecutándose. He parado de
              consultar al cliente para no saturarlo. La acción puede seguir
              corriendo en el VPS — comprueba con{" "}
              <span className="font-mono">pm2 list</span> y{" "}
              <span className="font-mono">pm2 logs gestion-aizquierdo</span>. Si
              está atascada en bucle, párala con{" "}
              <span className="font-mono">pm2 stop gestion-aizquierdo</span>.
            </AlertDescription>
          </Alert>
        ) : looksStuck ? (
          <Alert variant="warning">
            <AlertTriangle className="size-4" />
            <AlertTitle>Esto está tardando demasiado</AlertTitle>
            <AlertDescription>
              La acción lleva {formatDuration(elapsedMs)} ejecutándose. Si crees
              que está atascada en bucle, conéctate por SSH al VPS y haz{" "}
              <span className="font-mono">pm2 stop gestion-aizquierdo</span>{" "}
              para pararla.
            </AlertDescription>
          </Alert>
        ) : null}

        <pre
          ref={scrollRef}
          className="max-h-[55vh] min-h-[12rem] overflow-auto rounded-md border bg-slate-950 p-3 font-mono text-[12px] leading-5 text-slate-100"
          data-testid="action-logs-pre"
        >
          {status.isLoading && lines.length === 0 ? (
            <div className="space-y-1">
              {Array.from({ length: 4 }).map((_, i) => (
                <Skeleton key={i} className="h-4 w-full bg-slate-800/60" />
              ))}
            </div>
          ) : lines.length === 0 ? (
            <span className="text-slate-400">Sin output todavía…</span>
          ) : (
            lines.join("\n")
          )}
        </pre>

        {lines.length >= MAX_LOG_LINES ? (
          <p className="text-xs text-amber-700 dark:text-amber-300">
            ⚠ Buffer saturado ({MAX_LOG_LINES.toLocaleString("es-ES")} líneas).
            Solo se muestran las más recientes. Si la acción no termina, conéctate
            por SSH al VPS y revisa <span className="font-mono">pm2 logs</span>.
          </p>
        ) : null}

        <ActionMeta action={action} error={status.error as Error | undefined} />

        <DialogFooter>
          <Button variant="ghost" onClick={onClose}>
            <X className="size-4" /> Cerrar
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}

function ActionMeta({
  action,
  error,
}: {
  action: AdminAction | undefined;
  error: Error | undefined;
}) {
  if (error) {
    return (
      <p className="text-xs text-destructive">
        Error consultando estado: {error.message}
      </p>
    );
  }
  if (!action) return null;
  const parts: string[] = [];
  if (action.startedAt) parts.push(`iniciada ${shortTime(action.startedAt)}`);
  if (action.completedAt) parts.push(`finalizada ${shortTime(action.completedAt)}`);
  if (action.durationMs !== undefined) parts.push(formatDuration(action.durationMs));
  if (action.exitCode !== undefined) parts.push(`exit ${action.exitCode}`);
  return (
    <p className="text-xs text-muted-foreground">
      {parts.length > 0 ? parts.join(" · ") : null}
    </p>
  );
}

function StatusBadge({ status }: { status: string }) {
  if (status === "completed") {
    return (
      <Badge variant="success" className="gap-1">
        <CheckCircle2 className="size-3" /> Completado
      </Badge>
    );
  }
  if (status === "failed") {
    return (
      <Badge variant="destructive" className="gap-1">
        <X className="size-3" /> Fallido
      </Badge>
    );
  }
  if (status === "running") {
    return (
      <Badge variant="warning" className="gap-1">
        <Loader2 className="size-3 animate-spin" /> Ejecutando
      </Badge>
    );
  }
  return (
    <Badge variant="muted" className="gap-1">
      Pendiente
    </Badge>
  );
}

function labelOf(type: string): string {
  return (
    (ACTION_LABELS as Record<string, string>)[type] ?? type
  );
}

function shortTime(iso: string): string {
  const d = new Date(iso);
  if (Number.isNaN(d.getTime())) return iso;
  return d.toLocaleTimeString("es-ES", { hour12: false });
}

export function ActionStatusBadge({ status }: { status: string }) {
  return <StatusBadge status={status} />;
}
