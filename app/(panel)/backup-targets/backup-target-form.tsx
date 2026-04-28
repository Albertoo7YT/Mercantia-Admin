"use client";

import { useActionState, useState } from "react";
import Link from "next/link";
import { CheckCircle2, Loader2, PlugZap, XCircle } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Switch } from "@/components/ui/switch";
import { Alert, AlertDescription } from "@/components/ui/alert";
import { Card, CardContent } from "@/components/ui/card";
import {
  createBackupTarget,
  updateBackupTarget,
  type BTActionResult,
} from "./actions";

type BackupTarget = {
  id: string;
  name: string;
  host: string;
  port: number;
  username: string;
  sshKeyPath: string;
  remotePath: string;
  isDefault: boolean;
};

type Props =
  | { mode: "create"; target?: undefined }
  | { mode: "edit"; target: BackupTarget };

export function BackupTargetForm(props: Props) {
  const action =
    props.mode === "create"
      ? createBackupTarget
      : updateBackupTarget.bind(null, props.target.id);

  const [state, formAction, pending] = useActionState<BTActionResult | null, FormData>(
    async (prev, formData) => action(prev, formData),
    null,
  );

  const fieldErr = (key: string) =>
    state && !state.ok ? state.fieldErrors?.[key]?.[0] : undefined;

  const [testing, setTesting] = useState(false);
  const [testResult, setTestResult] = useState<
    | { ok: true; ms: number }
    | { ok: false; error: string; stderr?: string }
    | null
  >(null);

  async function runTest() {
    if (props.mode !== "edit") return;
    setTesting(true);
    setTestResult(null);
    try {
      const res = await fetch(`/api/backup-targets/${props.target.id}/test`, {
        method: "POST",
      });
      const data = (await res.json()) as
        | { ok: true; durationMs: number }
        | { ok: false; error: string; stderr?: string };
      if (data.ok) {
        setTestResult({ ok: true, ms: data.durationMs });
      } else {
        setTestResult({ ok: false, error: data.error, stderr: data.stderr });
      }
    } catch (e) {
      setTestResult({ ok: false, error: (e as Error).message });
    } finally {
      setTesting(false);
    }
  }

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
              defaultValue={props.target?.name ?? ""}
              required
              maxLength={120}
            />
            {fieldErr("name") ? (
              <p className="text-xs text-destructive">{fieldErr("name")}</p>
            ) : null}
          </div>

          <div className="grid grid-cols-1 gap-4 sm:grid-cols-3">
            <div className="space-y-2 sm:col-span-2">
              <Label htmlFor="host">Host *</Label>
              <Input
                id="host"
                name="host"
                defaultValue={props.target?.host ?? ""}
                required
              />
              {fieldErr("host") ? (
                <p className="text-xs text-destructive">{fieldErr("host")}</p>
              ) : null}
            </div>
            <div className="space-y-2">
              <Label htmlFor="port">Puerto *</Label>
              <Input
                id="port"
                name="port"
                type="number"
                defaultValue={props.target?.port ?? 22}
                required
                min={1}
                max={65535}
              />
              {fieldErr("port") ? (
                <p className="text-xs text-destructive">{fieldErr("port")}</p>
              ) : null}
            </div>
          </div>

          <div className="space-y-2">
            <Label htmlFor="username">Usuario *</Label>
            <Input
              id="username"
              name="username"
              defaultValue={props.target?.username ?? ""}
              required
            />
            {fieldErr("username") ? (
              <p className="text-xs text-destructive">{fieldErr("username")}</p>
            ) : null}
          </div>

          <div className="space-y-2">
            <Label htmlFor="sshKeyPath">Ruta de la clave SSH *</Label>
            <Input
              id="sshKeyPath"
              name="sshKeyPath"
              defaultValue={props.target?.sshKeyPath ?? ""}
              required
              placeholder="/root/.ssh/backup_id_ed25519"
            />
            {fieldErr("sshKeyPath") ? (
              <p className="text-xs text-destructive">{fieldErr("sshKeyPath")}</p>
            ) : null}
          </div>

          <div className="space-y-2">
            <Label htmlFor="remotePath">Ruta remota *</Label>
            <Input
              id="remotePath"
              name="remotePath"
              defaultValue={props.target?.remotePath ?? ""}
              required
              placeholder="/var/backups/clients"
            />
            {fieldErr("remotePath") ? (
              <p className="text-xs text-destructive">{fieldErr("remotePath")}</p>
            ) : null}
          </div>

          <div className="flex items-center justify-between rounded-md border p-3">
            <div>
              <Label htmlFor="isDefault" className="text-sm font-medium">
                Target por defecto
              </Label>
              <p className="text-xs text-muted-foreground">
                Se usa al crear backups si no se especifica otro.
              </p>
            </div>
            <Switch
              id="isDefault"
              name="isDefault"
              defaultChecked={props.target?.isDefault ?? false}
            />
          </div>

          <div className="flex flex-wrap items-center gap-2 pt-2">
            <Button type="submit" disabled={pending}>
              {pending ? <Loader2 className="size-4 animate-spin" /> : null}
              {props.mode === "create" ? "Crear target" : "Guardar cambios"}
            </Button>
            {props.mode === "edit" ? (
              <Button
                type="button"
                variant="outline"
                onClick={runTest}
                disabled={testing}
                title="Verifica que el panel puede conectar al target por SSH"
              >
                {testing ? (
                  <Loader2 className="size-4 animate-spin" />
                ) : (
                  <PlugZap className="size-4" />
                )}
                Probar conexión
              </Button>
            ) : null}
            <Button asChild type="button" variant="ghost">
              <Link href="/backup-targets">Cancelar</Link>
            </Button>
          </div>

          {testResult ? (
            testResult.ok ? (
              <Alert variant="info">
                <CheckCircle2 className="size-4" />
                <AlertDescription>
                  Conexión OK · {testResult.ms}ms
                </AlertDescription>
              </Alert>
            ) : (
              <Alert variant="destructive">
                <XCircle className="size-4" />
                <AlertDescription>
                  <div className="font-medium">{testResult.error}</div>
                  {testResult.stderr ? (
                    <pre className="mt-1 max-h-40 overflow-auto whitespace-pre-wrap rounded bg-background/40 p-2 text-[11px] text-muted-foreground">
                      {testResult.stderr}
                    </pre>
                  ) : null}
                </AlertDescription>
              </Alert>
            )
          ) : null}
        </form>
      </CardContent>
    </Card>
  );
}
