import { ArrowDown, ArrowUp, Minus } from "lucide-react";
import { Badge } from "@/components/ui/badge";
import {
  TICKET_PRIORITY_COLORS,
  TICKET_PRIORITY_LABELS,
  type TicketPriority,
} from "@/lib/tickets-constants";
import { cn } from "@/lib/utils";

const COLOR_CLASS: Record<string, string> = {
  red: "bg-red-100 text-red-800 dark:bg-red-950/30 dark:text-red-200 border-transparent",
  blue: "bg-sky-100 text-sky-800 dark:bg-sky-950/30 dark:text-sky-200 border-transparent",
  gray: "bg-slate-100 text-slate-700 dark:bg-slate-800 dark:text-slate-300 border-transparent",
};

const ICON: Record<string, React.ComponentType<{ className?: string }>> = {
  low: ArrowDown,
  normal: Minus,
  high: ArrowUp,
};

export function TicketPriorityBadge({
  priority,
  className,
}: {
  priority: TicketPriority | string;
  className?: string;
}) {
  const p = (priority as TicketPriority) ?? "normal";
  const color = TICKET_PRIORITY_COLORS[p] ?? "gray";
  const Icon = ICON[p] ?? Minus;
  const label = TICKET_PRIORITY_LABELS[p] ?? String(priority);
  return (
    <Badge
      variant="outline"
      className={cn("gap-1 font-normal", COLOR_CLASS[color], className)}
    >
      <Icon className="size-3" />
      {label}
    </Badge>
  );
}
