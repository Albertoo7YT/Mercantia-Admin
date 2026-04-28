"use client";

import Link from "next/link";
import { Badge } from "@/components/ui/badge";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";
import { TicketCategoryBadge } from "@/components/tickets/category-badge";
import { TicketStatusBadge } from "@/components/tickets/status-badge";
import { TicketPriorityBadge } from "@/components/tickets/priority-badge";
import {
  Tooltip,
  TooltipContent,
  TooltipTrigger,
} from "@/components/ui/tooltip";
import type { TenantTicketSummary } from "@/lib/api-client";
import { formatDate, formatRelativeDate } from "@/lib/utils";

export type TicketRow = TenantTicketSummary & {
  tenantId: string;
  tenantName: string;
  /** True if the panel could not reach this tenant when listing. */
  tenantOffline?: boolean;
};

type Props = {
  rows: TicketRow[];
  showTenant?: boolean;
};

export function TicketsTable({ rows, showTenant = true }: Props) {
  if (rows.length === 0) {
    return (
      <div className="rounded-md border border-dashed p-8 text-center text-sm text-muted-foreground">
        Sin tickets que coincidan con los filtros.
      </div>
    );
  }

  return (
    <div className="overflow-hidden rounded-md border bg-card">
      <Table>
        <TableHeader>
          <TableRow>
            {showTenant ? <TableHead>Cliente</TableHead> : null}
            <TableHead className="w-[4rem]">#</TableHead>
            <TableHead>Asunto</TableHead>
            <TableHead>Categoría</TableHead>
            <TableHead>Prioridad</TableHead>
            <TableHead>Estado</TableHead>
            <TableHead>Creado por</TableHead>
            <TableHead>Último mensaje</TableHead>
          </TableRow>
        </TableHeader>
        <TableBody>
          {rows.map((row) => (
            <TableRow key={`${row.tenantId}:${row.id}`}>
              {showTenant ? (
                <TableCell className="whitespace-nowrap">
                  <Link
                    href={`/tenants/${row.tenantId}`}
                    className="text-foreground hover:underline"
                  >
                    {row.tenantName}
                  </Link>
                  {row.tenantOffline ? (
                    <Badge variant="muted" className="ml-2">
                      sin conexión
                    </Badge>
                  ) : null}
                </TableCell>
              ) : null}
              <TableCell className="font-mono text-xs text-muted-foreground">
                #{row.number}
              </TableCell>
              <TableCell className="max-w-[28rem]">
                <Link
                  href={`/tickets/${row.tenantId}/${row.id}`}
                  className="hover:underline"
                >
                  <span className="block truncate font-medium">
                    {row.subject}
                  </span>
                  <span className="text-xs text-muted-foreground">
                    {row.messageCount}{" "}
                    {row.messageCount === 1 ? "mensaje" : "mensajes"}
                  </span>
                </Link>
              </TableCell>
              <TableCell>
                <TicketCategoryBadge category={row.category} />
              </TableCell>
              <TableCell>
                <TicketPriorityBadge priority={row.priority} />
              </TableCell>
              <TableCell>
                <TicketStatusBadge status={row.status} />
              </TableCell>
              <TableCell>
                <div className="flex flex-col">
                  <span className="text-sm">{row.createdBy?.name}</span>
                  <span className="font-mono text-xs text-muted-foreground">
                    {row.createdBy?.email}
                  </span>
                </div>
              </TableCell>
              <TableCell>
                <div className="flex items-center gap-2">
                  <Tooltip>
                    <TooltipTrigger asChild>
                      <span className="text-xs text-muted-foreground">
                        {formatRelativeDate(row.lastMessageAt)}
                      </span>
                    </TooltipTrigger>
                    <TooltipContent>
                      <span className="text-xs">
                        {formatDate(row.lastMessageAt)}
                      </span>
                    </TooltipContent>
                  </Tooltip>
                  {row.unreadByAdmin ? (
                    <Badge variant="destructive">Nuevo</Badge>
                  ) : null}
                </div>
              </TableCell>
            </TableRow>
          ))}
        </TableBody>
      </Table>
    </div>
  );
}
