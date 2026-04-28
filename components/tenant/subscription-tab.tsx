"use client";

import { useEffect, useMemo, useState } from "react";
import {
  useMutation,
  useQuery,
  useQueryClient,
} from "@tanstack/react-query";
import {
  AlertTriangle,
  Cloud,
  Loader2,
  Save,
  Tag,
} from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { Switch } from "@/components/ui/switch";
import { Skeleton } from "@/components/ui/skeleton";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Alert, AlertDescription, AlertTitle } from "@/components/ui/alert";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { ErrorState } from "@/components/ui/error-state";
import { UsageBar } from "@/components/plans/usage-bar";
import { PaymentsCard } from "@/components/tenant/payments-card";
import { useToast } from "@/hooks/use-toast";
import {
  centsToEuros,
  eurosToCents,
  formatEur,
} from "@/lib/money";
import {
  cn,
  formatDate,
  formatRelativeDate,
} from "@/lib/utils";
import type { TenantPlanData } from "@/lib/api-client";

const SUBSCRIPTION_KEY = (id: string) =>
  ["tenant", id, "subscription"] as const;
const PLAN_KEY = (id: string) => ["tenant", id, "plan-status"] as const;
const PLANS_KEY = ["plans"] as const;

type PlanRow = {
  id: string;
  slug: string;
  name: string;
  monthlyPrice: number;
  yearlyPrice: number;
  maxAdmins: number;
  maxOffice: number;
  maxSales: number;
  multiWarehouse: boolean;
  apiAccess: boolean;
};

type SubscriptionRow = {
  id: string;
  planId: string | null;
  plan: PlanRow | null;
  customMaxAdmins: number | null;
  customMaxOffice: number | null;
  customMaxSales: number | null;
  customMultiWarehouse: boolean | null;
  customApiAccess: boolean | null;
  contractStartDate: string | null;
  billingCycle: string | null;
  customMonthlyPrice: number | null;
  installationPrice: number | null;
  installationPaidAt: string | null;
  nextPaymentDate: string | null;
  paymentStatus: string | null;
  paymentMethod: string | null;
  notes: string | null;
  lastSyncedAt: string | null;
  syncStatus: string | null;
  syncError: string | null;
};

type Draft = {
  planId: string | null;
  hasOverrides: boolean;
  customMaxAdmins: string;
  customMaxOffice: string;
  customMaxSales: string;
  customMultiWarehouse: boolean | null;
  customApiAccess: boolean | null;
  contractStartDate: string;
  billingCycle: "monthly" | "yearly" | "";
  customMonthlyPriceEuros: string;
  installationPriceEuros: string;
  installationPaidAt: string;
  nextPaymentDate: string;
  paymentStatus: "active" | "overdue" | "trial" | "suspended" | "";
  paymentMethod: string;
  notes: string;
};

const EMPTY_DRAFT: Draft = {
  planId: null,
  hasOverrides: false,
  customMaxAdmins: "",
  customMaxOffice: "",
  customMaxSales: "",
  customMultiWarehouse: null,
  customApiAccess: null,
  contractStartDate: "",
  billingCycle: "",
  customMonthlyPriceEuros: "",
  installationPriceEuros: "",
  installationPaidAt: "",
  nextPaymentDate: "",
  paymentStatus: "",
  paymentMethod: "",
  notes: "",
};

function dateToInput(value: string | null): string {
  if (!value) return "";
  const d = new Date(value);
  if (Number.isNaN(d.getTime())) return "";
  return d.toISOString().slice(0, 10);
}

function draftFromSubscription(s: SubscriptionRow | null): Draft {
  if (!s) return { ...EMPTY_DRAFT };
  const overridesPresent =
    s.customMaxAdmins !== null ||
    s.customMaxOffice !== null ||
    s.customMaxSales !== null ||
    s.customMultiWarehouse !== null ||
    s.customApiAccess !== null;
  return {
    planId: s.planId,
    hasOverrides: overridesPresent,
    customMaxAdmins: s.customMaxAdmins?.toString() ?? "",
    customMaxOffice: s.customMaxOffice?.toString() ?? "",
    customMaxSales: s.customMaxSales?.toString() ?? "",
    customMultiWarehouse: s.customMultiWarehouse,
    customApiAccess: s.customApiAccess,
    contractStartDate: dateToInput(s.contractStartDate),
    billingCycle: (s.billingCycle as Draft["billingCycle"]) ?? "",
    customMonthlyPriceEuros:
      s.customMonthlyPrice !== null
        ? String(centsToEuros(s.customMonthlyPrice))
        : "",
    installationPriceEuros:
      s.installationPrice !== null && s.installationPrice !== undefined
        ? String(centsToEuros(s.installationPrice))
        : "",
    installationPaidAt: dateToInput(s.installationPaidAt ?? null),
    nextPaymentDate: dateToInput(s.nextPaymentDate),
    paymentStatus: (s.paymentStatus as Draft["paymentStatus"]) ?? "",
    paymentMethod: s.paymentMethod ?? "",
    notes: s.notes ?? "",
  };
}

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
    let parsed: { error?: string } = {};
    try {
      parsed = (await res.json()) as { error?: string };
    } catch {
      // ignore
    }
    throw new Error(parsed.error ?? `HTTP ${res.status}`);
  }
  return (await res.json()) as T;
}

async function postJson<T>(url: string): Promise<T> {
  const res = await fetch(url, { method: "POST" });
  if (!res.ok) {
    let parsed: { error?: string } = {};
    try {
      parsed = (await res.json()) as { error?: string };
    } catch {
      // ignore
    }
    throw new Error(parsed.error ?? `HTTP ${res.status}`);
  }
  return (await res.json()) as T;
}

export function SubscriptionTab({ tenantId }: { tenantId: string }) {
  const qc = useQueryClient();
  const { toast } = useToast();

  const subscription = useQuery({
    queryKey: SUBSCRIPTION_KEY(tenantId),
    queryFn: () =>
      getJson<{ subscription: SubscriptionRow | null }>(
        `/api/tenants/${tenantId}/subscription`,
      ),
    staleTime: 30_000,
  });

  const planStatus = useQuery({
    queryKey: PLAN_KEY(tenantId),
    queryFn: () =>
      getJson<TenantPlanData>(`/api/tenants/${tenantId}/plan`),
    staleTime: 30_000,
    refetchOnWindowFocus: true,
    retry: 0,
  });

  const plans = useQuery({
    queryKey: PLANS_KEY,
    queryFn: () => getJson<{ plans: PlanRow[] }>("/api/plans"),
    staleTime: 5 * 60_000,
  });

  const [draft, setDraft] = useState<Draft>(EMPTY_DRAFT);
  const [initialized, setInitialized] = useState(false);

  useEffect(() => {
    if (!subscription.data) return;
    if (initialized) return;
    setDraft(draftFromSubscription(subscription.data.subscription));
    setInitialized(true);
  }, [subscription.data, initialized]);

  const planById = useMemo(() => {
    const map = new Map<string, PlanRow>();
    for (const p of plans.data?.plans ?? []) map.set(p.id, p);
    return map;
  }, [plans.data]);

  const draftPlan: PlanRow | null = draft.planId
    ? planById.get(draft.planId) ?? null
    : null;

  const effectiveLimits = useMemo(() => {
    const base = draftPlan
      ? {
          planSlug: draftPlan.slug,
          planName: draftPlan.name,
          maxAdmins: draftPlan.maxAdmins,
          maxOffice: draftPlan.maxOffice,
          maxSales: draftPlan.maxSales,
          multiWarehouse: draftPlan.multiWarehouse,
          apiAccess: draftPlan.apiAccess,
        }
      : {
          planSlug: "none",
          planName: "Sin plan",
          maxAdmins: 1,
          maxOffice: 1,
          maxSales: 3,
          multiWarehouse: false,
          apiAccess: false,
        };
    if (draft.hasOverrides) {
      const n = (s: string, fb: number) =>
        s === "" ? fb : Math.max(0, parseInt(s, 10) || 0);
      base.maxAdmins = n(draft.customMaxAdmins, base.maxAdmins);
      base.maxOffice = n(draft.customMaxOffice, base.maxOffice);
      base.maxSales = n(draft.customMaxSales, base.maxSales);
      if (draft.customMultiWarehouse !== null) {
        base.multiWarehouse = draft.customMultiWarehouse;
      }
      if (draft.customApiAccess !== null) {
        base.apiAccess = draft.customApiAccess;
      }
    }
    return base;
  }, [draftPlan, draft]);

  const desyncFields = useMemo(() => {
    const client = planStatus.data?.limits;
    if (!client) return [];
    const diffs: string[] = [];
    if (effectiveLimits.planSlug !== client.planSlug) diffs.push("plan");
    if (effectiveLimits.maxAdmins !== client.maxAdmins) diffs.push("admins");
    if (effectiveLimits.maxOffice !== client.maxOffice) diffs.push("oficina");
    if (effectiveLimits.maxSales !== client.maxSales)
      diffs.push("comerciales");
    if (
      Boolean(effectiveLimits.multiWarehouse) !== Boolean(client.multiWarehouse)
    ) {
      diffs.push("multi-almacén");
    }
    if (
      Boolean(effectiveLimits.apiAccess) !== Boolean(client.apiAccess)
    ) {
      diffs.push("api");
    }
    return diffs;
  }, [effectiveLimits, planStatus.data]);

  const dirty = useMemo(() => {
    const fromServer = draftFromSubscription(
      subscription.data?.subscription ?? null,
    );
    return JSON.stringify(fromServer) !== JSON.stringify(draft);
  }, [draft, subscription.data]);

  const save = useMutation({
    mutationFn: () =>
      putJson<{ subscription: SubscriptionRow }>(
        `/api/tenants/${tenantId}/subscription`,
        draftToPayload(draft),
      ),
    onSuccess: (data) => {
      toast({ title: "Suscripción guardada" });
      qc.setQueryData(SUBSCRIPTION_KEY(tenantId), {
        subscription: data.subscription,
      });
      setDraft(draftFromSubscription(data.subscription));
    },
    onError: (err) => {
      toast({
        title: "No se pudo guardar",
        description: (err as Error).message,
        variant: "destructive",
      });
    },
  });

  const sync = useMutation({
    mutationFn: () =>
      postJson<{ ok: true }>(`/api/tenants/${tenantId}/plan/sync`),
    onSuccess: () => {
      toast({ title: "Plan sincronizado con el cliente" });
      qc.invalidateQueries({ queryKey: SUBSCRIPTION_KEY(tenantId) });
      qc.invalidateQueries({ queryKey: PLAN_KEY(tenantId) });
    },
    onError: (err) => {
      toast({
        title: "Sincronización fallida",
        description: (err as Error).message,
        variant: "destructive",
      });
      qc.invalidateQueries({ queryKey: SUBSCRIPTION_KEY(tenantId) });
    },
  });

  if (subscription.isLoading || plans.isLoading) {
    return (
      <div className="space-y-3">
        <Skeleton className="h-10 w-full" />
        <Skeleton className="h-32 w-full" />
        <Skeleton className="h-32 w-full" />
      </div>
    );
  }
  if (subscription.isError) {
    return (
      <ErrorState
        title="No se pudo cargar la suscripción"
        onRetry={() => subscription.refetch()}
        technicalDetail={(subscription.error as Error)?.message}
      />
    );
  }

  const sub = subscription.data?.subscription ?? null;

  return (
    <div className="space-y-6">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <div>
          <h2 className="text-base font-medium">Suscripción</h2>
          <p className="text-xs text-muted-foreground">
            {dirty
              ? "Cambios sin guardar"
              : sub
                ? `Última actualización ${formatRelativeDate(
                    sub.lastSyncedAt ?? new Date().toISOString(),
                  )}`
                : "Sin suscripción asignada"}
          </p>
        </div>
        <div className="flex items-center gap-2">
          <Button
            variant="outline"
            onClick={() => sync.mutate()}
            disabled={dirty || sync.isPending}
            title={dirty ? "Guarda los cambios primero" : "Sincronizar al cliente"}
          >
            {sync.isPending ? (
              <Loader2 className="size-4 animate-spin" />
            ) : (
              <Cloud className="size-4" />
            )}
            Sincronizar plan
          </Button>
          <Button
            onClick={() => save.mutate()}
            disabled={!dirty || save.isPending}
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

      {desyncFields.length > 0 ? (
        <Alert variant="warning">
          <AlertTriangle className="size-4" />
          <AlertTitle>Panel y cliente desincronizados</AlertTitle>
          <AlertDescription>
            Diferencias en: {desyncFields.join(", ")}.{" "}
            <button
              type="button"
              className="underline underline-offset-2"
              onClick={() => sync.mutate()}
              disabled={dirty || sync.isPending}
            >
              Sincronizar ahora
            </button>
            {dirty
              ? " (guarda los cambios primero)"
              : ""}
          </AlertDescription>
        </Alert>
      ) : null}

      <PlanPicker
        plans={plans.data?.plans ?? []}
        draft={draft}
        onChange={setDraft}
      />

      <EffectiveLimitsCard
        effective={effectiveLimits}
        sub={sub}
      />

      <UsageCard
        usage={planStatus.data?.usage}
        limits={effectiveLimits}
        isLoading={planStatus.isLoading}
        isError={planStatus.isError}
        onRetry={() => planStatus.refetch()}
      />

      <CommercialCard
        draft={draft}
        onChange={setDraft}
      />

      <PaymentsCard tenantId={tenantId} />
    </div>
  );
}

// ---------------------------------------------------------------------------

function PlanPicker({
  plans,
  draft,
  onChange,
}: {
  plans: PlanRow[];
  draft: Draft;
  onChange: (next: Draft) => void;
}) {
  const sortedPlans = [...plans];
  return (
    <Card>
      <CardHeader className="pb-3">
        <CardTitle className="text-sm uppercase tracking-wide text-muted-foreground">
          Plan actual
        </CardTitle>
      </CardHeader>
      <CardContent className="space-y-3">
        <div className="grid grid-cols-1 gap-2 sm:grid-cols-2 lg:grid-cols-4">
          <PlanRadio
            checked={draft.planId === null}
            onChange={() => onChange({ ...draft, planId: null })}
            title="Sin asignar"
            subtitle="Sin plan en el panel."
          />
          {sortedPlans.map((p) => (
            <PlanRadio
              key={p.id}
              checked={draft.planId === p.id}
              onChange={() => onChange({ ...draft, planId: p.id })}
              title={p.name}
              subtitle={`${formatEur(p.monthlyPrice)} / mes`}
            />
          ))}
        </div>

        <label className="mt-3 flex items-center gap-2 text-sm">
          <Switch
            checked={draft.hasOverrides}
            onCheckedChange={(v) =>
              onChange({ ...draft, hasOverrides: Boolean(v) })
            }
          />
          Aplicar overrides personalizados
        </label>
        {draft.hasOverrides ? (
          <OverridesSection draft={draft} onChange={onChange} />
        ) : (
          <p className="text-xs text-muted-foreground">
            Si activas overrides podrás fijar límites manuales que sobrescriben
            los del plan.
          </p>
        )}
      </CardContent>
    </Card>
  );
}

function PlanRadio({
  checked,
  onChange,
  title,
  subtitle,
}: {
  checked: boolean;
  onChange: () => void;
  title: string;
  subtitle: string;
}) {
  return (
    <button
      type="button"
      onClick={onChange}
      className={cn(
        "flex flex-col gap-1 rounded-md border p-3 text-left text-sm transition-colors",
        checked
          ? "border-foreground bg-muted"
          : "border-border hover:bg-muted/40",
      )}
    >
      <span className="flex items-center gap-2 font-medium">
        <Tag className="size-3.5 text-muted-foreground" />
        {title}
        {checked ? (
          <Badge variant="success" className="ml-auto">
            Activo
          </Badge>
        ) : null}
      </span>
      <span className="text-xs text-muted-foreground">{subtitle}</span>
    </button>
  );
}

function OverridesSection({
  draft,
  onChange,
}: {
  draft: Draft;
  onChange: (next: Draft) => void;
}) {
  return (
    <div className="rounded-md border bg-muted/30 p-3 space-y-3">
      <div className="grid grid-cols-1 gap-3 sm:grid-cols-3">
        <div className="space-y-1">
          <Label htmlFor="ov-sales">Comerciales (override)</Label>
          <Input
            id="ov-sales"
            type="number"
            min={0}
            value={draft.customMaxSales}
            onChange={(e) =>
              onChange({ ...draft, customMaxSales: e.target.value })
            }
            placeholder="usar plan"
          />
        </div>
        <div className="space-y-1">
          <Label htmlFor="ov-office">Oficina (override)</Label>
          <Input
            id="ov-office"
            type="number"
            min={0}
            value={draft.customMaxOffice}
            onChange={(e) =>
              onChange({ ...draft, customMaxOffice: e.target.value })
            }
            placeholder="usar plan"
          />
        </div>
        <div className="space-y-1">
          <Label htmlFor="ov-admins">Admins (override)</Label>
          <Input
            id="ov-admins"
            type="number"
            min={0}
            value={draft.customMaxAdmins}
            onChange={(e) =>
              onChange({ ...draft, customMaxAdmins: e.target.value })
            }
            placeholder="usar plan"
          />
        </div>
      </div>
      <div className="grid grid-cols-1 gap-3 sm:grid-cols-2">
        <TriStateSwitch
          label="Multi-almacén"
          value={draft.customMultiWarehouse}
          onChange={(v) => onChange({ ...draft, customMultiWarehouse: v })}
        />
        <TriStateSwitch
          label="Acceso API"
          value={draft.customApiAccess}
          onChange={(v) => onChange({ ...draft, customApiAccess: v })}
        />
      </div>
      <div className="grid grid-cols-1 gap-3 sm:grid-cols-2">
        <div className="space-y-1">
          <Label htmlFor="ov-price">Precio mensual personalizado (€)</Label>
          <Input
            id="ov-price"
            type="text"
            inputMode="decimal"
            pattern="[0-9]+([.,][0-9]{1,2})?"
            value={draft.customMonthlyPriceEuros}
            onChange={(e) =>
              onChange({
                ...draft,
                customMonthlyPriceEuros: e.target.value,
              })
            }
            placeholder="usar precio del plan"
          />
        </div>
      </div>
      <p className="text-xs text-muted-foreground">
        Deja un campo vacío o pon el switch en "según plan" para usar el valor
        del plan.
      </p>
    </div>
  );
}

function TriStateSwitch({
  label,
  value,
  onChange,
}: {
  label: string;
  value: boolean | null;
  onChange: (v: boolean | null) => void;
}) {
  // Tri-state: true (override on) / false (override off) / null (use plan).
  const display: "plan" | "on" | "off" =
    value === true ? "on" : value === false ? "off" : "plan";
  return (
    <div className="flex items-center justify-between rounded-md border bg-card p-2 text-sm">
      <span>{label}</span>
      <Select
        value={display}
        onValueChange={(v) => {
          if (v === "plan") onChange(null);
          else onChange(v === "on");
        }}
      >
        <SelectTrigger className="h-8 w-32">
          <SelectValue />
        </SelectTrigger>
        <SelectContent>
          <SelectItem value="plan">según plan</SelectItem>
          <SelectItem value="on">activado</SelectItem>
          <SelectItem value="off">desactivado</SelectItem>
        </SelectContent>
      </Select>
    </div>
  );
}

// ---------------------------------------------------------------------------

function EffectiveLimitsCard({
  effective,
  sub,
}: {
  effective: {
    planName: string;
    maxAdmins: number;
    maxOffice: number;
    maxSales: number;
    multiWarehouse: boolean;
    apiAccess: boolean;
  };
  sub: SubscriptionRow | null;
}) {
  const syncBadge =
    sub?.syncStatus === "ok" ? (
      <Badge variant="success">Sincronizado</Badge>
    ) : sub?.syncStatus === "failed" ? (
      <Badge variant="destructive">Sync falló</Badge>
    ) : (
      <Badge variant="muted">Sin sincronizar</Badge>
    );
  return (
    <Card>
      <CardHeader className="pb-3">
        <CardTitle className="text-sm uppercase tracking-wide text-muted-foreground">
          Límites efectivos
        </CardTitle>
      </CardHeader>
      <CardContent className="space-y-2">
        <p className="text-sm">
          <span className="font-medium">{effective.planName}</span>
          <span className="ml-2 text-xs text-muted-foreground">
            ({effective.maxSales} comerciales · {effective.maxOffice} oficina ·{" "}
            {effective.maxAdmins} admins ·{" "}
            {effective.multiWarehouse ? "multi-almacén" : "1 almacén"} ·{" "}
            {effective.apiAccess ? "API" : "sin API"})
          </span>
        </p>
        <div className="flex flex-wrap items-center gap-2 text-xs text-muted-foreground">
          {syncBadge}
          {sub?.lastSyncedAt ? (
            <span title={formatDate(sub.lastSyncedAt)}>
              hace {formatRelativeDate(sub.lastSyncedAt)}
            </span>
          ) : null}
          {sub?.syncError ? (
            <span className="text-destructive">{sub.syncError}</span>
          ) : null}
        </div>
      </CardContent>
    </Card>
  );
}

// ---------------------------------------------------------------------------

function UsageCard({
  usage,
  limits,
  isLoading,
  isError,
  onRetry,
}: {
  usage:
    | { admins: number; office: number; sales: number; total: number }
    | undefined;
  limits: {
    maxAdmins: number;
    maxOffice: number;
    maxSales: number;
  };
  isLoading: boolean;
  isError: boolean;
  onRetry: () => void;
}) {
  const overSales =
    usage !== undefined && usage.sales > limits.maxSales;
  const overOffice =
    usage !== undefined && usage.office > limits.maxOffice;
  const overAdmins =
    usage !== undefined && usage.admins > limits.maxAdmins;
  return (
    <Card>
      <CardHeader className="pb-3">
        <CardTitle className="text-sm uppercase tracking-wide text-muted-foreground">
          Uso actual del cliente
        </CardTitle>
      </CardHeader>
      <CardContent className="space-y-3">
        {isLoading ? (
          <div className="space-y-2">
            <Skeleton className="h-3 w-full" />
            <Skeleton className="h-3 w-full" />
            <Skeleton className="h-3 w-full" />
          </div>
        ) : isError || !usage ? (
          <div className="text-sm text-muted-foreground">
            No se pudo leer el uso del cliente.{" "}
            <button
              type="button"
              onClick={onRetry}
              className="underline underline-offset-2"
            >
              Reintentar
            </button>
          </div>
        ) : (
          <>
            <UsageBar
              label="Comerciales"
              used={usage.sales}
              limit={limits.maxSales}
            />
            <UsageBar
              label="Oficina"
              used={usage.office}
              limit={limits.maxOffice}
            />
            <UsageBar
              label="Admins"
              used={usage.admins}
              limit={limits.maxAdmins}
            />
            <p className="text-xs text-muted-foreground">
              Total: {usage.total} usuarios activos
            </p>
            {(overSales || overOffice || overAdmins) ? (
              <Alert variant="warning">
                <AlertTriangle className="size-4" />
                <AlertDescription>
                  El cliente tiene más usuarios activos que el nuevo límite.
                  Los existentes seguirán activos pero no se podrán crear más.
                </AlertDescription>
              </Alert>
            ) : null}
          </>
        )}
      </CardContent>
    </Card>
  );
}

// ---------------------------------------------------------------------------

function CommercialCard({
  draft,
  onChange,
}: {
  draft: Draft;
  onChange: (next: Draft) => void;
}) {
  return (
    <Card>
      <CardHeader className="pb-3">
        <CardTitle className="text-sm uppercase tracking-wide text-muted-foreground">
          Datos comerciales
        </CardTitle>
      </CardHeader>
      <CardContent className="grid grid-cols-1 gap-3 sm:grid-cols-2">
        <div className="space-y-1">
          <Label htmlFor="contractStart">Inicio del contrato</Label>
          <Input
            id="contractStart"
            type="date"
            value={draft.contractStartDate}
            onChange={(e) =>
              onChange({ ...draft, contractStartDate: e.target.value })
            }
          />
        </div>
        <div className="space-y-1">
          <Label htmlFor="billingCycle">Ciclo de facturación</Label>
          <Select
            value={draft.billingCycle || "_none"}
            onValueChange={(v) =>
              onChange({
                ...draft,
                billingCycle:
                  v === "_none" ? "" : (v as Draft["billingCycle"]),
              })
            }
          >
            <SelectTrigger id="billingCycle">
              <SelectValue placeholder="—" />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value="_none">Sin definir</SelectItem>
              <SelectItem value="monthly">Mensual</SelectItem>
              <SelectItem value="yearly">Anual</SelectItem>
            </SelectContent>
          </Select>
        </div>
        <div className="space-y-1">
          <Label htmlFor="nextPayment">Próximo pago</Label>
          <Input
            id="nextPayment"
            type="date"
            value={draft.nextPaymentDate}
            onChange={(e) =>
              onChange({ ...draft, nextPaymentDate: e.target.value })
            }
          />
        </div>
        <div className="space-y-1">
          <Label htmlFor="installationPrice">Precio instalación (€)</Label>
          <Input
            id="installationPrice"
            type="text"
            inputMode="decimal"
            pattern="[0-9]+([.,][0-9]{1,2})?"
            value={draft.installationPriceEuros}
            onChange={(e) =>
              onChange({
                ...draft,
                installationPriceEuros: e.target.value,
              })
            }
            placeholder="0,00"
          />
        </div>
        <div className="space-y-1">
          <Label htmlFor="installationPaidAt">Instalación pagada el</Label>
          <Input
            id="installationPaidAt"
            type="date"
            value={draft.installationPaidAt}
            onChange={(e) =>
              onChange({ ...draft, installationPaidAt: e.target.value })
            }
          />
        </div>
        <div className="space-y-1">
          <Label htmlFor="paymentStatus">Estado de pago</Label>
          <Select
            value={draft.paymentStatus || "_none"}
            onValueChange={(v) =>
              onChange({
                ...draft,
                paymentStatus:
                  v === "_none" ? "" : (v as Draft["paymentStatus"]),
              })
            }
          >
            <SelectTrigger id="paymentStatus">
              <SelectValue placeholder="—" />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value="_none">Sin definir</SelectItem>
              <SelectItem value="active">Activo</SelectItem>
              <SelectItem value="trial">Trial</SelectItem>
              <SelectItem value="overdue">Vencido</SelectItem>
              <SelectItem value="suspended">Suspendido</SelectItem>
            </SelectContent>
          </Select>
        </div>
        <div className="space-y-1">
          <Label htmlFor="paymentMethod">Método de pago</Label>
          <Input
            id="paymentMethod"
            value={draft.paymentMethod}
            onChange={(e) =>
              onChange({ ...draft, paymentMethod: e.target.value })
            }
            placeholder="Transferencia, domiciliación…"
          />
        </div>
        <div className="space-y-1 sm:col-span-2">
          <Label htmlFor="notes">Notas internas</Label>
          <Textarea
            id="notes"
            rows={3}
            maxLength={2000}
            value={draft.notes}
            onChange={(e) => onChange({ ...draft, notes: e.target.value })}
          />
        </div>
      </CardContent>
    </Card>
  );
}

// ---------------------------------------------------------------------------

function draftToPayload(draft: Draft) {
  const numOrNull = (s: string) =>
    s === "" || s === undefined ? null : Math.max(0, parseInt(s, 10) || 0);
  return {
    planId: draft.planId,
    customMaxAdmins: draft.hasOverrides ? numOrNull(draft.customMaxAdmins) : null,
    customMaxOffice: draft.hasOverrides ? numOrNull(draft.customMaxOffice) : null,
    customMaxSales: draft.hasOverrides ? numOrNull(draft.customMaxSales) : null,
    customMultiWarehouse: draft.hasOverrides ? draft.customMultiWarehouse : null,
    customApiAccess: draft.hasOverrides ? draft.customApiAccess : null,
    contractStartDate: draft.contractStartDate || null,
    billingCycle: draft.billingCycle || null,
    customMonthlyPrice:
      draft.customMonthlyPriceEuros === ""
        ? null
        : eurosToCents(draft.customMonthlyPriceEuros),
    installationPrice:
      draft.installationPriceEuros === ""
        ? null
        : eurosToCents(draft.installationPriceEuros),
    installationPaidAt: draft.installationPaidAt || null,
    nextPaymentDate: draft.nextPaymentDate || null,
    paymentStatus: draft.paymentStatus || null,
    paymentMethod: draft.paymentMethod || null,
    notes: draft.notes || null,
  };
}

