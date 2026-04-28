import { cn } from "@/lib/utils";

type Props = {
  label: string;
  used: number;
  limit: number;
  className?: string;
};

export function UsageBar({ label, used, limit, className }: Props) {
  const safeLimit = limit > 0 ? limit : 0;
  const pct = safeLimit > 0 ? Math.min((used / safeLimit) * 100, 100) : 0;
  const overLimit = used > safeLimit;
  const tone =
    overLimit || pct >= 100
      ? "bg-red-500"
      : pct >= 80
        ? "bg-amber-500"
        : "bg-emerald-500";
  const label2 = overLimit
    ? "sobre límite"
    : pct >= 80
      ? "cerca del límite"
      : "ok";
  return (
    <div className={cn("space-y-1", className)}>
      <div className="flex items-center justify-between text-xs">
        <span className="font-medium">{label}</span>
        <span className="tabular-nums text-muted-foreground">
          {used}/{safeLimit}{" "}
          {safeLimit > 0 ? `(${Math.round(pct)}%)` : ""}{" "}
          {pct >= 80 || overLimit ? (
            <span
              className={cn(
                overLimit ? "text-red-700" : "text-amber-700",
              )}
            >
              · {label2}
            </span>
          ) : null}
        </span>
      </div>
      <div className="relative h-2 overflow-hidden rounded-full bg-muted">
        <div
          className={cn("absolute inset-y-0 left-0 transition-[width]", tone)}
          style={{ width: `${pct}%` }}
        />
      </div>
    </div>
  );
}
