"use client";

import { useActionState, useEffect, useState } from "react";
import Link from "next/link";
import { Loader2 } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { Alert, AlertDescription } from "@/components/ui/alert";
import { Card, CardContent } from "@/components/ui/card";
import { slugify } from "@/lib/utils";
import { createTenant, updateTenant, type ActionResult } from "./actions";

type Tenant = {
  id: string;
  name: string;
  slug: string;
  apiUrl: string;
  status: string;
  notes: string | null;
  backupTargetId: string | null;
  backupSubdir: string | null;
};

type BackupTargetOption = {
  id: string;
  name: string;
  host: string;
  remotePath: string;
  isDefault: boolean;
};

type Props =
  | { mode: "create"; tenant?: undefined; backupTargets: BackupTargetOption[] }
  | {
      mode: "edit";
      tenant: Tenant;
      backupTargets: BackupTargetOption[];
    };

export function TenantForm(props: Props) {
  const [name, setName] = useState(props.tenant?.name ?? "");
  const [slug, setSlug] = useState(props.tenant?.slug ?? "");
  const [slugTouched, setSlugTouched] = useState(props.mode === "edit");

  const action =
    props.mode === "create"
      ? createTenant
      : updateTenant.bind(null, props.tenant.id);

  const [state, formAction, pending] = useActionState<ActionResult | null, FormData>(
    async (prev, formData) => action(prev, formData),
    null,
  );

  useEffect(() => {
    if (!slugTouched) setSlug(slugify(name));
  }, [name, slugTouched]);

  const fieldErr = (key: string) =>
    state && !state.ok ? state.fieldErrors?.[key]?.[0] : undefined;

  return (
    <Card className="max-w-2xl">
      <CardContent className="pt-6">
        <form action={formAction} className="space-y-5">
          {state && !state.ok ? (
            <Alert variant="destructive">
              <AlertDescription>{state.error}</AlertDescription>
            </Alert>
          ) : null}

          <div className="space-y-2">
            <Label htmlFor="name">Nombre *</Label>
            <Input
              id="name"
              name="name"
              value={name}
              onChange={(e) => setName(e.target.value)}
              required
              maxLength={120}
              autoFocus
            />
            {fieldErr("name") ? (
              <p className="text-xs text-destructive">{fieldErr("name")}</p>
            ) : null}
          </div>

          <div className="space-y-2">
            <Label htmlFor="slug">Slug *</Label>
            <Input
              id="slug"
              name="slug"
              value={slug}
              onChange={(e) => {
                setSlug(e.target.value);
                setSlugTouched(true);
              }}
              required
              maxLength={64}
              placeholder="mi-cliente"
            />
            <p className="text-xs text-muted-foreground">
              Identificador único (a-z, 0-9 y guiones).
            </p>
            {fieldErr("slug") ? (
              <p className="text-xs text-destructive">{fieldErr("slug")}</p>
            ) : null}
          </div>

          <div className="space-y-2">
            <Label htmlFor="apiUrl">API URL *</Label>
            <Input
              id="apiUrl"
              name="apiUrl"
              type="url"
              defaultValue={props.tenant?.apiUrl ?? ""}
              placeholder="https://cliente.mercantia.pro"
              required
            />
            {fieldErr("apiUrl") ? (
              <p className="text-xs text-destructive">{fieldErr("apiUrl")}</p>
            ) : null}
          </div>

          <div className="space-y-2">
            <Label htmlFor="apiToken">
              API Token {props.mode === "create" ? "*" : "(dejar vacío para no cambiar)"}
            </Label>
            <Input
              id="apiToken"
              name="apiToken"
              type="password"
              autoComplete="new-password"
              required={props.mode === "create"}
              maxLength={512}
            />
            {fieldErr("apiToken") ? (
              <p className="text-xs text-destructive">{fieldErr("apiToken")}</p>
            ) : null}
          </div>

          <div className="space-y-2">
            <Label htmlFor="status">Estado *</Label>
            <Select name="status" defaultValue={props.tenant?.status ?? "active"}>
              <SelectTrigger id="status">
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="active">Activo</SelectItem>
                <SelectItem value="trial">Prueba</SelectItem>
                <SelectItem value="suspended">Suspendido</SelectItem>
              </SelectContent>
            </Select>
          </div>

          <div className="space-y-2">
            <Label htmlFor="notes">Notas</Label>
            <Textarea
              id="notes"
              name="notes"
              rows={3}
              maxLength={2000}
              defaultValue={props.tenant?.notes ?? ""}
              placeholder="Anotaciones internas, contactos, recordatorios…"
            />
          </div>

          <div className="space-y-3 rounded-md border bg-muted/30 p-3">
            <div className="text-sm font-medium">Backup remoto</div>
            <p className="-mt-2 text-xs text-muted-foreground">
              A qué target SSH se suben los backups de este cliente. Si lo dejas
              vacío, usa el target marcado como "default".
            </p>

            <div className="space-y-2">
              <Label htmlFor="backupTargetId">Target</Label>
              <Select
                name="backupTargetId"
                defaultValue={props.tenant?.backupTargetId ?? "_default"}
              >
                <SelectTrigger id="backupTargetId">
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="_default">
                    Usar target por defecto
                  </SelectItem>
                  {props.backupTargets.map((t) => (
                    <SelectItem key={t.id} value={t.id}>
                      {t.name} · {t.host}:{t.remotePath}
                      {t.isDefault ? " (default)" : ""}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>

            <div className="space-y-2">
              <Label htmlFor="backupSubdir">
                Subcarpeta dentro del target
              </Label>
              <Input
                id="backupSubdir"
                name="backupSubdir"
                defaultValue={props.tenant?.backupSubdir ?? ""}
                maxLength={200}
                placeholder={`por defecto: ${props.tenant?.slug ?? "<slug>"}`}
              />
              <p className="text-xs text-muted-foreground">
                Si lo dejas vacío, se usa el slug del cliente. Solo a-z, 0-9,
                <code className="mx-1">. _ - /</code>.
              </p>
            </div>
          </div>

          <div className="flex items-center gap-2 pt-2">
            <Button type="submit" disabled={pending}>
              {pending ? <Loader2 className="size-4 animate-spin" /> : null}
              {props.mode === "create" ? "Crear cliente" : "Guardar cambios"}
            </Button>
            <Button asChild type="button" variant="ghost">
              <Link
                href={
                  props.mode === "edit"
                    ? `/tenants/${props.tenant.id}`
                    : "/tenants"
                }
              >
                Cancelar
              </Link>
            </Button>
          </div>
        </form>
      </CardContent>
    </Card>
  );
}
