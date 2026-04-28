"use client";

import { Input } from "@/components/ui/input";
import { Switch } from "@/components/ui/switch";
import { Label } from "@/components/ui/label";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import {
  TICKET_CATEGORIES,
  TICKET_CATEGORY_LABELS,
  TICKET_PRIORITIES,
  TICKET_PRIORITY_LABELS,
  TICKET_STATUSES,
  TICKET_STATUS_LABELS,
  type TicketCategory,
  type TicketPriority,
  type TicketStatus,
} from "@/lib/tickets-constants";
import { cn } from "@/lib/utils";

export type TicketsFilters = {
  status: TicketStatus[];
  category?: TicketCategory;
  priority?: TicketPriority;
  search: string;
  unreadOnly: boolean;
  tenantId?: string;
};

type Props = {
  filters: TicketsFilters;
  onChange: (next: TicketsFilters) => void;
  tenants?: Array<{ id: string; name: string }>;
  showTenantFilter?: boolean;
  className?: string;
};

export function TicketsFiltersBar({
  filters,
  onChange,
  tenants,
  showTenantFilter,
  className,
}: Props) {
  function toggleStatus(s: TicketStatus) {
    onChange({
      ...filters,
      status: filters.status.includes(s)
        ? filters.status.filter((x) => x !== s)
        : [...filters.status, s],
    });
  }

  return (
    <div
      className={cn(
        "grid grid-cols-1 gap-3 rounded-md border bg-card p-3 lg:grid-cols-12",
        className,
      )}
    >
      <div className="space-y-1.5 lg:col-span-4">
        <Label className="text-xs uppercase tracking-wide text-muted-foreground">
          Buscar
        </Label>
        <Input
          value={filters.search}
          onChange={(e) =>
            onChange({ ...filters, search: e.target.value })
          }
          placeholder="Asunto…"
        />
      </div>

      {showTenantFilter ? (
        <div className="space-y-1.5 lg:col-span-3">
          <Label className="text-xs uppercase tracking-wide text-muted-foreground">
            Cliente
          </Label>
          <Select
            value={filters.tenantId ?? "all"}
            onValueChange={(v) =>
              onChange({
                ...filters,
                tenantId: v === "all" ? undefined : v,
              })
            }
          >
            <SelectTrigger className="h-9">
              <SelectValue />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value="all">Todos los clientes</SelectItem>
              {tenants?.map((t) => (
                <SelectItem key={t.id} value={t.id}>
                  {t.name}
                </SelectItem>
              ))}
            </SelectContent>
          </Select>
        </div>
      ) : null}

      <div className="space-y-1.5 lg:col-span-2">
        <Label className="text-xs uppercase tracking-wide text-muted-foreground">
          Categoría
        </Label>
        <Select
          value={filters.category ?? "all"}
          onValueChange={(v) =>
            onChange({
              ...filters,
              category: v === "all" ? undefined : (v as TicketCategory),
            })
          }
        >
          <SelectTrigger className="h-9">
            <SelectValue />
          </SelectTrigger>
          <SelectContent>
            <SelectItem value="all">Todas</SelectItem>
            {TICKET_CATEGORIES.map((c) => (
              <SelectItem key={c} value={c}>
                {TICKET_CATEGORY_LABELS[c]}
              </SelectItem>
            ))}
          </SelectContent>
        </Select>
      </div>

      <div className="space-y-1.5 lg:col-span-2">
        <Label className="text-xs uppercase tracking-wide text-muted-foreground">
          Prioridad
        </Label>
        <Select
          value={filters.priority ?? "all"}
          onValueChange={(v) =>
            onChange({
              ...filters,
              priority: v === "all" ? undefined : (v as TicketPriority),
            })
          }
        >
          <SelectTrigger className="h-9">
            <SelectValue />
          </SelectTrigger>
          <SelectContent>
            <SelectItem value="all">Todas</SelectItem>
            {TICKET_PRIORITIES.map((p) => (
              <SelectItem key={p} value={p}>
                {TICKET_PRIORITY_LABELS[p]}
              </SelectItem>
            ))}
          </SelectContent>
        </Select>
      </div>

      <div className="flex items-center gap-2 lg:col-span-1 lg:justify-end">
        <Switch
          id="ticket-unread-only"
          checked={filters.unreadOnly}
          onCheckedChange={(v) =>
            onChange({ ...filters, unreadOnly: Boolean(v) })
          }
        />
        <Label
          htmlFor="ticket-unread-only"
          className="text-xs text-muted-foreground"
        >
          Solo no leídos
        </Label>
      </div>

      <div className="flex flex-wrap gap-1.5 lg:col-span-12">
        {TICKET_STATUSES.map((s) => {
          const active = filters.status.includes(s);
          return (
            <button
              key={s}
              type="button"
              onClick={() => toggleStatus(s)}
              className={cn(
                "rounded-md border px-2 py-0.5 text-xs transition-colors",
                active
                  ? "bg-foreground/90 text-background border-transparent"
                  : "border-border bg-background text-muted-foreground hover:text-foreground",
              )}
            >
              {TICKET_STATUS_LABELS[s]}
            </button>
          );
        })}
      </div>
    </div>
  );
}
