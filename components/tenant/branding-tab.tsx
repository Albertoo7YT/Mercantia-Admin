"use client";

import { useEffect, useMemo, useState } from "react";
import {
  useMutation,
  useQuery,
  useQueryClient,
} from "@tanstack/react-query";
import { Loader2, RotateCcw, Save } from "lucide-react";
import { Button } from "@/components/ui/button";
import { ErrorState } from "@/components/ui/error-state";
import { Skeleton } from "@/components/ui/skeleton";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { useToast } from "@/hooks/use-toast";
import { BrandingForm } from "@/components/tenant/branding-form";
import { BrandingPreview } from "@/components/tenant/branding-preview";
import { BrandingAudit } from "@/components/tenant/branding-audit";
import {
  diffBranding,
  validateBranding,
  type BrandingAuditEvent,
  type BrandingField,
  type TenantBrandingPayload,
  type ValidationErrors,
} from "@/lib/types/tenant-branding";

const BRANDING_KEY = (id: string) => ["tenant", id, "branding"] as const;
const AUDIT_KEY = (id: string) =>
  ["tenant", id, "branding", "audit"] as const;

async function getJson<T>(url: string): Promise<T> {
  const res = await fetch(url, { cache: "no-store" });
  if (!res.ok) {
    let body: { error?: string } = {};
    try {
      body = (await res.json()) as { error?: string };
    } catch {
      // ignore
    }
    throw new Error(body.error ?? `HTTP ${res.status}`);
  }
  return (await res.json()) as T;
}

async function putJson<T>(url: string, body: unknown): Promise<T> {
  const res = await fetch(url, {
    method: "PUT",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(body),
  });
  if (!res.ok) {
    let parsed: {
      error?: string;
      fieldErrors?: ValidationErrors;
    } = {};
    try {
      parsed = (await res.json()) as typeof parsed;
    } catch {
      // ignore
    }
    const err = new Error(parsed.error ?? `HTTP ${res.status}`) as Error & {
      fieldErrors?: ValidationErrors;
    };
    err.fieldErrors = parsed.fieldErrors;
    throw err;
  }
  return (await res.json()) as T;
}

export function BrandingTab({ tenantId }: { tenantId: string }) {
  const qc = useQueryClient();
  const { toast } = useToast();

  const branding = useQuery({
    queryKey: BRANDING_KEY(tenantId),
    queryFn: () =>
      getJson<TenantBrandingPayload>(`/api/tenants/${tenantId}/branding`),
    staleTime: 60_000,
    refetchOnWindowFocus: true,
  });

  const audit = useQuery({
    queryKey: AUDIT_KEY(tenantId),
    queryFn: () =>
      getJson<{ events: BrandingAuditEvent[] }>(
        `/api/tenants/${tenantId}/branding/audit`,
      ),
    staleTime: 30_000,
  });

  const [draft, setDraft] = useState<Partial<TenantBrandingPayload>>({});
  const [serverErrors, setServerErrors] = useState<ValidationErrors>({});

  // Initialize the draft from server data the first time it lands, and on
  // every successful refetch (only if the user has no pending changes).
  useEffect(() => {
    if (!branding.data) return;
    setDraft((current) => {
      // First load: copy server values verbatim.
      if (Object.keys(current).length === 0) return { ...branding.data! };
      // Subsequent refetches: preserve in-flight edits if there are any.
      const hasPendingChanges =
        diffBranding(branding.data!, current).length > 0;
      return hasPendingChanges ? current : { ...branding.data! };
    });
  }, [branding.data]);

  const dirtyFields = useMemo<BrandingField[]>(() => {
    if (!branding.data) return [];
    return diffBranding(branding.data, draft);
  }, [branding.data, draft]);

  const clientErrors = useMemo<ValidationErrors>(
    () => validateBranding(draft),
    [draft],
  );

  const errors = { ...clientErrors, ...serverErrors };
  const hasErrors = Object.keys(errors).length > 0;
  const isDirty = dirtyFields.length > 0;

  const save = useMutation({
    mutationFn: () => {
      const patch: Partial<TenantBrandingPayload> = {};
      for (const f of dirtyFields) {
        const v = draft[f];
        (patch as Record<string, unknown>)[f] =
          v === undefined ? "" : v;
      }
      return putJson<TenantBrandingPayload>(
        `/api/tenants/${tenantId}/branding`,
        patch,
      );
    },
    onSuccess: (data) => {
      qc.setQueryData(BRANDING_KEY(tenantId), data);
      qc.invalidateQueries({ queryKey: AUDIT_KEY(tenantId) });
      setDraft({ ...data });
      setServerErrors({});
      toast({ title: "Branding actualizado" });
    },
    onError: (err) => {
      const e = err as Error & { fieldErrors?: ValidationErrors };
      if (e.fieldErrors) setServerErrors(e.fieldErrors);
      toast({
        title: "No se pudo guardar el branding",
        description: e.message,
        variant: "destructive",
      });
    },
  });

  function handleChange(field: BrandingField, value: string | undefined) {
    setDraft((d) => ({ ...d, [field]: value }));
    setServerErrors((prev) => {
      if (!prev[field]) return prev;
      const next = { ...prev };
      delete next[field];
      return next;
    });
  }

  function discard() {
    if (!branding.data) return;
    setDraft({ ...branding.data });
    setServerErrors({});
  }

  return (
    <div className="space-y-6">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <div>
          <h2 className="text-base font-medium">Branding del cliente</h2>
          <p className="text-xs text-muted-foreground">
            {isDirty
              ? `${dirtyFields.length} cambio${dirtyFields.length === 1 ? "" : "s"} sin guardar`
              : "Sin cambios pendientes"}
          </p>
        </div>
        <div className="flex items-center gap-2">
          {isDirty ? (
            <Button
              variant="ghost"
              onClick={discard}
              disabled={save.isPending}
            >
              <RotateCcw className="size-4" />
              Descartar
            </Button>
          ) : null}
          <Button
            onClick={() => save.mutate()}
            disabled={!isDirty || hasErrors || save.isPending}
          >
            {save.isPending ? (
              <Loader2 className="size-4 animate-spin" />
            ) : (
              <Save className="size-4" />
            )}
            Guardar cambios
          </Button>
        </div>
      </div>

      {branding.isLoading ? (
        <BrandingSkeleton />
      ) : branding.isError ? (
        <ErrorState
          title="No se pudo cargar el branding del cliente"
          description="Verifica la conexión Tailscale y el token de la API admin."
          onRetry={() => branding.refetch()}
          retrying={branding.isFetching}
          technicalDetail={(branding.error as Error)?.message}
        />
      ) : (
        <div className="grid grid-cols-1 gap-6 lg:grid-cols-2">
          <div className="space-y-3">
            <BrandingForm
              tenantId={tenantId}
              payload={draft}
              errors={errors}
              onChange={handleChange}
              disabled={save.isPending}
            />
          </div>
          <div className="lg:sticky lg:top-4 lg:self-start">
            <BrandingPreview payload={draft} />
          </div>
        </div>
      )}

      <BrandingAudit
        events={audit.data?.events}
        isLoading={audit.isLoading}
        isError={audit.isError}
        error={audit.error as Error | undefined}
        onRetry={() => audit.refetch()}
      />
    </div>
  );
}

function BrandingSkeleton() {
  return (
    <div className="grid grid-cols-1 gap-6 lg:grid-cols-2">
      <Card>
        <CardHeader className="pb-3">
          <CardTitle className="text-sm uppercase tracking-wide text-muted-foreground">
            Cargando…
          </CardTitle>
        </CardHeader>
        <CardContent className="space-y-3">
          {Array.from({ length: 6 }).map((_, i) => (
            <Skeleton key={i} className="h-9 w-full" />
          ))}
        </CardContent>
      </Card>
      <Card>
        <CardContent className="space-y-3 py-6">
          <Skeleton className="h-12 w-full" />
          <Skeleton className="h-32 w-full" />
        </CardContent>
      </Card>
    </div>
  );
}
