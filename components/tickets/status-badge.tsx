import { Badge } from "@/components/ui/badge";
import {
  TICKET_STATUS_COLORS,
  TICKET_STATUS_LABELS,
  type TicketStatus,
} from "@/lib/tickets-constants";
import { cn } from "@/lib/utils";

const COLOR_CLASS: Record<string, string> = {
  yellow:
    "bg-amber-100 text-amber-800 dark:bg-amber-950/30 dark:text-amber-200 border-transparent",
  blue: "bg-sky-100 text-sky-800 dark:bg-sky-950/30 dark:text-sky-200 border-transparent",
  green:
    "bg-emerald-100 text-emerald-800 dark:bg-emerald-950/30 dark:text-emerald-200 border-transparent",
  gray: "bg-slate-100 text-slate-800 dark:bg-slate-800 dark:text-slate-200 border-transparent",
};

export function TicketStatusBadge({
  status,
  className,
}: {
  status: TicketStatus | string;
  className?: string;
}) {
  const s = (status as TicketStatus) ?? "open";
  const color = TICKET_STATUS_COLORS[s] ?? "gray";
  const label = TICKET_STATUS_LABELS[s] ?? String(status);
  return (
    <Badge
      variant="outline"
      className={cn("font-normal", COLOR_CLASS[color], className)}
    >
      {label}
    </Badge>
  );
}
