import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";
import { Badge } from "@/components/ui/badge";
import { formatDate, formatRelativeDate } from "@/lib/utils";

export type OperationLogRow = {
  id: string;
  tenantId: string | null;
  tenantName?: string | null;
  action: string;
  actor: string;
  status: string;
  errorMessage: string | null;
  details?: unknown;
  createdAt: Date | string;
};

type Props = {
  logs: OperationLogRow[];
  showTenant?: boolean;
  emptyMessage?: string;
};

export function OperationLogTable({
  logs,
  showTenant = true,
  emptyMessage = "Sin operaciones registradas.",
}: Props) {
  if (logs.length === 0) {
    return (
      <div className="rounded-md border border-dashed p-8 text-center text-sm text-muted-foreground">
        {emptyMessage}
      </div>
    );
  }

  return (
    <Table>
      <TableHeader>
        <TableRow>
          <TableHead>Cuándo</TableHead>
          <TableHead>Acción</TableHead>
          {showTenant ? <TableHead>Tenant</TableHead> : null}
          <TableHead>Actor</TableHead>
          <TableHead>Estado</TableHead>
          <TableHead>Detalle</TableHead>
        </TableRow>
      </TableHeader>
      <TableBody>
        {logs.map((log) => (
          <TableRow key={log.id}>
            <TableCell
              className="whitespace-nowrap text-muted-foreground"
              title={formatDate(log.createdAt)}
            >
              {formatRelativeDate(log.createdAt)}
            </TableCell>
            <TableCell className="font-mono text-xs">
              {prettyAction(log)}
            </TableCell>
            {showTenant ? (
              <TableCell>
                {log.tenantName ?? log.tenantId ?? (
                  <span className="text-muted-foreground">—</span>
                )}
              </TableCell>
            ) : null}
            <TableCell className="text-muted-foreground">{log.actor}</TableCell>
            <TableCell>
              <StatusBadge status={log.status} />
            </TableCell>
            <TableCell className="max-w-[28rem] truncate text-xs text-muted-foreground">
              {detailLine(log)}
            </TableCell>
          </TableRow>
        ))}
      </TableBody>
    </Table>
  );
}

function StatusBadge({ status }: { status: string }) {
  if (status === "success") return <Badge variant="success">OK</Badge>;
  if (status === "pending") return <Badge variant="warning">Pendiente</Badge>;
  return <Badge variant="destructive">Error</Badge>;
}

type ToggleDetails = {
  module?: unknown;
  enabled?: unknown;
  reason?: unknown;
};

function readToggleDetails(details: unknown): ToggleDetails | null {
  if (!details || typeof details !== "object") return null;
  const d = details as Record<string, unknown>;
  if (typeof d.module !== "string" || typeof d.enabled !== "boolean") return null;
  return d;
}

const ACTION_TYPE_LABELS: Record<string, string> = {
  deploy: "deploy",
  restart_pm2: "reinicio PM2",
  backup_now: "backup manual",
  maintenance_on: "mantenimiento ON",
  maintenance_off: "mantenimiento OFF",
};

function prettyAction(log: OperationLogRow): string {
  if (log.action === "module_toggle") {
    const d = readToggleDetails(log.details);
    if (d && typeof d.module === "string" && typeof d.enabled === "boolean") {
      return `Cambio módulo ${d.module} → ${d.enabled ? "activado" : "desactivado"}`;
    }
  }
  if (log.action.startsWith("tenant_action_")) {
    const type = log.action.slice("tenant_action_".length);
    return `Acción · ${ACTION_TYPE_LABELS[type] ?? type}`;
  }
  if (log.action === "tenant_branding_update") {
    const d = log.details;
    if (d && typeof d === "object") {
      const fields = (d as Record<string, unknown>).fieldsChanged;
      if (Array.isArray(fields) && fields.length > 0) {
        return `Branding · ${fields.join(", ")}`;
      }
    }
    return "Branding actualizado";
  }
  if (log.action === "tenant_ticket_reply") {
    const d = log.details as Record<string, unknown> | null;
    const internal = d && d.internalNote === true;
    const count =
      d && typeof d.attachmentsCount === "number"
        ? (d.attachmentsCount as number)
        : 0;
    return `Ticket · respuesta${internal ? " (nota interna)" : ""}${
      count > 0 ? ` · ${count} adjuntos` : ""
    }`;
  }
  if (log.action === "tenant_ticket_status_change") {
    const d = log.details as Record<string, unknown> | null;
    const newStatus = d?.newStatus;
    return `Ticket · estado → ${
      typeof newStatus === "string" ? newStatus : "?"
    }`;
  }
  if (log.action === "tenant_ticket_attachment_download") {
    const d = log.details as Record<string, unknown> | null;
    const filename =
      typeof d?.filename === "string" ? d.filename : "(adjunto)";
    return `Ticket · descarga ${filename}`;
  }
  return log.action;
}

function detailLine(log: OperationLogRow): string {
  if (log.errorMessage) return log.errorMessage;
  if (log.action === "module_toggle") {
    const d = readToggleDetails(log.details);
    if (d?.reason && typeof d.reason === "string") {
      return `motivo: ${d.reason}`;
    }
  }
  if (log.action.startsWith("tenant_action_")) {
    const d = log.details;
    if (d && typeof d === "object") {
      const obj = d as Record<string, unknown>;
      const parts: string[] = [];
      if (typeof obj.exitCode === "number") parts.push(`exit ${obj.exitCode}`);
      if (typeof obj.durationMs === "number") {
        parts.push(`${(obj.durationMs / 1000).toFixed(1)}s`);
      }
      if (parts.length > 0) return parts.join(" · ");
    }
  }
  return "—";
}
