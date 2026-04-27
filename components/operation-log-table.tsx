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

function prettyAction(log: OperationLogRow): string {
  if (log.action === "module_toggle") {
    const d = readToggleDetails(log.details);
    if (d && typeof d.module === "string" && typeof d.enabled === "boolean") {
      return `Cambio módulo ${d.module} → ${d.enabled ? "activado" : "desactivado"}`;
    }
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
  return "—";
}
