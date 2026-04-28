import { Badge } from "@/components/ui/badge";
import {
  TICKET_CATEGORY_COLORS,
  TICKET_CATEGORY_ICONS,
  TICKET_CATEGORY_LABELS,
  type TicketCategory,
} from "@/lib/tickets-constants";
import { cn } from "@/lib/utils";

const COLOR_CLASS: Record<string, string> = {
  red: "bg-red-100 text-red-800 dark:bg-red-950/30 dark:text-red-200 border-transparent",
  orange:
    "bg-orange-100 text-orange-800 dark:bg-orange-950/30 dark:text-orange-200 border-transparent",
  blue: "bg-sky-100 text-sky-800 dark:bg-sky-950/30 dark:text-sky-200 border-transparent",
  gray: "bg-slate-100 text-slate-800 dark:bg-slate-800 dark:text-slate-200 border-transparent",
};

export function TicketCategoryBadge({
  category,
  showLabel = true,
  className,
}: {
  category: TicketCategory | string;
  showLabel?: boolean;
  className?: string;
}) {
  const cat = (category as TicketCategory) ?? "other";
  const color = TICKET_CATEGORY_COLORS[cat] ?? "gray";
  const Icon = TICKET_CATEGORY_ICONS[cat] ?? TICKET_CATEGORY_ICONS.other;
  const label = TICKET_CATEGORY_LABELS[cat] ?? String(category);
  return (
    <Badge
      variant="outline"
      className={cn("gap-1 font-normal", COLOR_CLASS[color], className)}
      title={label}
    >
      <Icon className="size-3" />
      {showLabel ? label : null}
    </Badge>
  );
}
