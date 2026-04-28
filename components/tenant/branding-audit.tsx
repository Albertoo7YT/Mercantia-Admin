"use client";

import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Skeleton } from "@/components/ui/skeleton";
import { ErrorState } from "@/components/ui/error-state";
import {
  BRANDING_FIELD_LABELS,
  type BrandingAuditEvent,
  type BrandingField,
} from "@/lib/types/tenant-branding";
import { formatDate, formatRelativeDate } from "@/lib/utils";

type Props = {
  events: BrandingAuditEvent[] | undefined;
  isLoading: boolean;
  isError: boolean;
  error?: Error;
  onRetry: () => void;
};

export function BrandingAudit({
  events,
  isLoading,
  isError,
  error,
  onRetry,
}: Props) {
  return (
    <Card>
      <CardHeader className="pb-3">
        <CardTitle className="text-sm uppercase tracking-wide text-muted-foreground">
          Historial
        </CardTitle>
      </CardHeader>
      <CardContent>
        {isLoading ? (
          <div className="space-y-2">
            {Array.from({ length: 4 }).map((_, i) => (
              <Skeleton key={i} className="h-5 w-full" />
            ))}
          </div>
        ) : isError ? (
          <ErrorState
            title="No se pudo cargar el historial de branding"
            onRetry={onRetry}
            technicalDetail={error?.message}
          />
        ) : !events || events.length === 0 ? (
          <p className="text-sm text-muted-foreground">
            Sin cambios registrados en el cliente.
          </p>
        ) : (
          <ul className="space-y-1.5">
            {events.map((e) => (
              <li
                key={String(e.id)}
                className="flex flex-wrap items-baseline gap-x-2 gap-y-0.5 text-sm"
              >
                <span className="font-medium">{labelOf(e.field)}</span>
                <span className="text-muted-foreground">:</span>
                <ValuePill value={e.oldValue} />
                <span className="text-muted-foreground">→</span>
                <ValuePill value={e.newValue} />
                <span
                  className="ml-auto whitespace-nowrap text-xs text-muted-foreground"
                  title={formatDate(e.createdAt)}
                >
                  {formatRelativeDate(e.createdAt)}
                  {e.performedBy ? ` · ${e.performedBy}` : ""}
                </span>
              </li>
            ))}
          </ul>
        )}
      </CardContent>
    </Card>
  );
}

function labelOf(field: string): string {
  return (
    (BRANDING_FIELD_LABELS as Record<string, string>)[field] ??
    field
  );
}

function ValuePill({ value }: { value: unknown }) {
  if (value === null || value === undefined || value === "") {
    return (
      <span className="rounded bg-muted px-1.5 py-0.5 font-mono text-xs text-muted-foreground">
        —
      </span>
    );
  }
  const str =
    typeof value === "string"
      ? value
      : typeof value === "number" || typeof value === "boolean"
        ? String(value)
        : JSON.stringify(value);
  // Color values get a swatch.
  const isHex = typeof value === "string" && /^#[0-9a-fA-F]{6}$/.test(value);
  return (
    <span className="inline-flex items-center gap-1 rounded bg-muted px-1.5 py-0.5 font-mono text-xs">
      {isHex ? (
        <span
          className="inline-block size-3 rounded border"
          style={{ backgroundColor: str }}
        />
      ) : null}
      <span className="max-w-[20rem] truncate">{str}</span>
    </span>
  );
}
