"use client";

import { useState } from "react";
import { AlertCircle, ChevronDown, ChevronRight, RotateCw } from "lucide-react";
import { Button } from "@/components/ui/button";
import { cn } from "@/lib/utils";

type Props = {
  title: string;
  description?: React.ReactNode;
  onRetry?: () => void;
  retrying?: boolean;
  technicalDetail?: string;
  className?: string;
};

export function ErrorState({
  title,
  description,
  onRetry,
  retrying = false,
  technicalDetail,
  className,
}: Props) {
  const [open, setOpen] = useState(false);
  return (
    <div
      className={cn(
        "rounded-md border border-destructive/30 bg-destructive/5 p-6",
        className,
      )}
    >
      <div className="flex items-start gap-3">
        <AlertCircle className="mt-0.5 size-5 shrink-0 text-destructive" />
        <div className="flex-1">
          <h3 className="text-sm font-medium text-foreground">{title}</h3>
          {description ? (
            <p className="mt-1 text-sm text-muted-foreground">{description}</p>
          ) : null}
          <div className="mt-4 flex flex-wrap items-center gap-2">
            {onRetry ? (
              <Button
                size="sm"
                variant="outline"
                onClick={onRetry}
                disabled={retrying}
              >
                <RotateCw
                  className={cn("size-4", retrying && "animate-spin")}
                />
                Reintentar
              </Button>
            ) : null}
            {technicalDetail ? (
              <button
                type="button"
                onClick={() => setOpen((v) => !v)}
                className="inline-flex items-center gap-1 text-xs text-muted-foreground hover:text-foreground"
              >
                {open ? (
                  <ChevronDown className="size-3.5" />
                ) : (
                  <ChevronRight className="size-3.5" />
                )}
                Detalle técnico
              </button>
            ) : null}
          </div>
          {open && technicalDetail ? (
            <pre className="mt-3 max-h-40 overflow-auto rounded bg-background p-2 text-[11px] leading-relaxed text-muted-foreground">
              {technicalDetail}
            </pre>
          ) : null}
        </div>
      </div>
    </div>
  );
}
