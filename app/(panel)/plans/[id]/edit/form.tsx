"use client";

import { useActionState } from "react";
import Link from "next/link";
import { Loader2 } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { Switch } from "@/components/ui/switch";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import {
  Alert,
  AlertDescription,
  AlertTitle,
} from "@/components/ui/alert";
import { centsToEuros } from "@/lib/money";
import { updatePlan, type UpdatePlanResult } from "../../actions";

type Plan = {
  id: string;
  slug: string;
  name: string;
  description: string;
  monthlyPrice: number;
  yearlyPrice: number;
  maxAdmins: number;
  maxOffice: number;
  maxSales: number;
  multiWarehouse: boolean;
  apiAccess: boolean;
  isPopular: boolean;
  active: boolean;
  sortOrder: number;
};

export function PlanEditForm({
  plan,
  subscriptionsCount,
}: {
  plan: Plan;
  subscriptionsCount: number;
}) {
  const [state, action, pending] = useActionState<UpdatePlanResult | null, FormData>(
    async (prev, fd) => updatePlan(plan.id, prev, fd),
    null,
  );

  const fieldErr = (key: string) =>
    state && !state.ok ? state.fieldErrors?.[key]?.[0] : undefined;

  return (
    <form action={action} className="max-w-2xl space-y-4">
      {subscriptionsCount > 0 ? (
        <Alert variant="warning">
          <AlertTitle>Plan en uso</AlertTitle>
          <AlertDescription>
            Este plan tiene {subscriptionsCount} cliente
            {subscriptionsCount === 1 ? "" : "s"} suscrito
            {subscriptionsCount === 1 ? "" : "s"}. Los cambios deben sincronizarse
            manualmente desde la pestaña Suscripción de cada cliente.
          </AlertDescription>
        </Alert>
      ) : null}

      {state && !state.ok ? (
        <Alert variant="destructive">
          <AlertDescription>{state.error}</AlertDescription>
        </Alert>
      ) : null}

      <Card>
        <CardHeader className="pb-3">
          <CardTitle className="text-sm uppercase tracking-wide text-muted-foreground">
            Identidad
          </CardTitle>
        </CardHeader>
        <CardContent className="space-y-3">
          <div className="space-y-1.5">
            <Label htmlFor="slug">Slug</Label>
            <Input id="slug" value={plan.slug} disabled className="font-mono" />
            <p className="text-xs text-muted-foreground">El slug no se puede cambiar.</p>
          </div>
          <Field
            label="Nombre"
            name="name"
            defaultValue={plan.name}
            required
            error={fieldErr("name")}
          />
          <div className="space-y-1.5">
            <Label htmlFor="description">Descripción</Label>
            <Textarea
              id="description"
              name="description"
              defaultValue={plan.description}
              rows={2}
              maxLength={500}
            />
          </div>
        </CardContent>
      </Card>

      <Card>
        <CardHeader className="pb-3">
          <CardTitle className="text-sm uppercase tracking-wide text-muted-foreground">
            Precios
          </CardTitle>
        </CardHeader>
        <CardContent className="grid grid-cols-1 gap-3 sm:grid-cols-2">
          <Field
            label="Mensual (€)"
            name="monthlyPriceEuros"
            type="text"
            inputMode="decimal"
            pattern="[0-9]+([.,][0-9]{1,2})?"
            placeholder="49"
            defaultValue={String(centsToEuros(plan.monthlyPrice))}
            required
            error={fieldErr("monthlyPriceEuros")}
          />
          <Field
            label="Anual (€)"
            name="yearlyPriceEuros"
            type="text"
            inputMode="decimal"
            pattern="[0-9]+([.,][0-9]{1,2})?"
            placeholder="490"
            defaultValue={String(centsToEuros(plan.yearlyPrice))}
            required
            error={fieldErr("yearlyPriceEuros")}
          />
        </CardContent>
      </Card>

      <Card>
        <CardHeader className="pb-3">
          <CardTitle className="text-sm uppercase tracking-wide text-muted-foreground">
            Límites
          </CardTitle>
        </CardHeader>
        <CardContent className="grid grid-cols-1 gap-3 sm:grid-cols-3">
          <Field
            label="Comerciales"
            name="maxSales"
            type="number"
            min={0}
            defaultValue={String(plan.maxSales)}
            required
            error={fieldErr("maxSales")}
          />
          <Field
            label="Oficina"
            name="maxOffice"
            type="number"
            min={0}
            defaultValue={String(plan.maxOffice)}
            required
            error={fieldErr("maxOffice")}
          />
          <Field
            label="Admins"
            name="maxAdmins"
            type="number"
            min={0}
            defaultValue={String(plan.maxAdmins)}
            required
            error={fieldErr("maxAdmins")}
          />
        </CardContent>
      </Card>

      <Card>
        <CardHeader className="pb-3">
          <CardTitle className="text-sm uppercase tracking-wide text-muted-foreground">
            Features
          </CardTitle>
        </CardHeader>
        <CardContent className="space-y-3">
          <SwitchRow
            id="multiWarehouse"
            label="Multi-almacén"
            defaultChecked={plan.multiWarehouse}
          />
          <SwitchRow
            id="apiAccess"
            label="Acceso API"
            defaultChecked={plan.apiAccess}
          />
        </CardContent>
      </Card>

      <Card>
        <CardHeader className="pb-3">
          <CardTitle className="text-sm uppercase tracking-wide text-muted-foreground">
            Visualización
          </CardTitle>
        </CardHeader>
        <CardContent className="space-y-3">
          <div className="grid grid-cols-1 gap-3 sm:grid-cols-2">
            <SwitchRow
              id="isPopular"
              label="Marcar como popular"
              defaultChecked={plan.isPopular}
            />
            <SwitchRow
              id="active"
              label="Plan activo"
              defaultChecked={plan.active}
            />
          </div>
          <Field
            label="Orden de aparición"
            name="sortOrder"
            type="number"
            min={0}
            defaultValue={String(plan.sortOrder)}
            required
            error={fieldErr("sortOrder")}
          />
        </CardContent>
      </Card>

      <div className="flex items-center gap-2">
        <Button type="submit" disabled={pending}>
          {pending ? <Loader2 className="size-4 animate-spin" /> : null}
          Guardar cambios
        </Button>
        <Button asChild type="button" variant="ghost">
          <Link href="/plans">Cancelar</Link>
        </Button>
      </div>
    </form>
  );
}

function Field({
  label,
  name,
  defaultValue,
  required,
  error,
  type,
  step,
  min,
  inputMode,
  pattern,
  placeholder,
}: {
  label: string;
  name: string;
  defaultValue?: string;
  required?: boolean;
  error?: string;
  type?: string;
  step?: string;
  min?: number;
  inputMode?: "numeric" | "decimal" | "text";
  pattern?: string;
  placeholder?: string;
}) {
  return (
    <div className="space-y-1.5">
      <Label htmlFor={name}>
        {label}
        {required ? <span className="ml-1 text-destructive">*</span> : null}
      </Label>
      <Input
        id={name}
        name={name}
        defaultValue={defaultValue}
        required={required}
        type={type}
        step={step}
        min={min}
        inputMode={inputMode}
        pattern={pattern}
        placeholder={placeholder}
      />
      {error ? <p className="text-xs text-destructive">{error}</p> : null}
    </div>
  );
}

function SwitchRow({
  id,
  label,
  defaultChecked,
}: {
  id: string;
  label: string;
  defaultChecked?: boolean;
}) {
  return (
    <div className="flex items-center justify-between rounded-md border p-3">
      <Label htmlFor={id} className="text-sm">
        {label}
      </Label>
      <Switch id={id} name={id} defaultChecked={defaultChecked} />
    </div>
  );
}
