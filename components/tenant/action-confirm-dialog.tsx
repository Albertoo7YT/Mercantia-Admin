"use client";

import { useEffect, useState } from "react";
import { AlertTriangle } from "lucide-react";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { Alert, AlertDescription, AlertTitle } from "@/components/ui/alert";
import {
  ACTION_LABELS,
  type ActionType,
} from "@/lib/types/tenant-actions";

export type ConfirmPayload = {
  type: ActionType;
  metadata?: Record<string, unknown>;
};

type Props = {
  state:
    | {
        type: ActionType;
        maintenanceActive: boolean;
      }
    | null;
  pending?: boolean;
  onCancel: () => void;
  onConfirm: (payload: ConfirmPayload) => void;
};

export function ActionConfirmDialog({
  state,
  pending,
  onCancel,
  onConfirm,
}: Props) {
  const [activateMaintenance, setActivateMaintenance] = useState(false);
  const [maintenanceMessage, setMaintenanceMessage] = useState("");
  const [maintenanceDuration, setMaintenanceDuration] = useState("");

  useEffect(() => {
    if (state) {
      setActivateMaintenance(false);
      setMaintenanceMessage("");
      setMaintenanceDuration("");
    }
  }, [state]);

  if (!state) return null;
  const { type, maintenanceActive } = state;

  function handleConfirm() {
    if (!state) return;
    if (state.type === "deploy") {
      const meta: Record<string, unknown> = {};
      if (!maintenanceActive && activateMaintenance) {
        meta.activateMaintenanceDuringDeploy = true;
      }
      onConfirm({
        type: state.type,
        metadata: Object.keys(meta).length > 0 ? meta : undefined,
      });
      return;
    }
    if (state.type === "maintenance_on") {
      const meta: Record<string, unknown> = {};
      const msg = maintenanceMessage.trim();
      const dur = parseInt(maintenanceDuration, 10);
      if (msg) meta.message = msg;
      if (Number.isFinite(dur) && dur > 0) meta.expectedDurationMinutes = dur;
      onConfirm({
        type: state.type,
        metadata: Object.keys(meta).length > 0 ? meta : undefined,
      });
      return;
    }
    onConfirm({ type: state.type });
  }

  return (
    <Dialog open onOpenChange={(open) => !open && !pending && onCancel()}>
      <DialogContent>
        <DialogHeader>
          <DialogTitle>{ACTION_LABELS[type]}</DialogTitle>
          <DialogDescription>{descriptionFor(type)}</DialogDescription>
        </DialogHeader>

        {type === "deploy" ? (
          <>
            <Alert variant="warning">
              <AlertTriangle className="size-4" />
              <AlertTitle>Acción crítica</AlertTitle>
              <AlertDescription>
                Esto va a tirar Git, ejecutar tests, aplicar migraciones de DB y
                reiniciar la app. ¿Continuar?
              </AlertDescription>
            </Alert>
            {!maintenanceActive ? (
              <label className="flex items-start gap-2 text-sm">
                <input
                  type="checkbox"
                  className="mt-0.5 size-4 accent-current"
                  checked={activateMaintenance}
                  onChange={(e) => setActivateMaintenance(e.target.checked)}
                />
                <span>
                  <span className="font-medium">
                    Activar mantenimiento durante el deploy
                  </span>
                  <span className="block text-xs text-muted-foreground">
                    Bloquea el acceso de usuarios mientras dura la operación.
                  </span>
                </span>
              </label>
            ) : (
              <p className="text-xs text-muted-foreground">
                El modo mantenimiento ya está activo.
              </p>
            )}
          </>
        ) : null}

        {type === "maintenance_on" ? (
          <div className="space-y-3">
            <div className="space-y-1.5">
              <Label htmlFor="maintenance-message">Mensaje (opcional)</Label>
              <Textarea
                id="maintenance-message"
                value={maintenanceMessage}
                onChange={(e) => setMaintenanceMessage(e.target.value)}
                rows={2}
                maxLength={300}
                placeholder="Estamos haciendo mejoras, volvemos en un rato."
              />
            </div>
            <div className="space-y-1.5">
              <Label htmlFor="maintenance-duration">
                Duración estimada (minutos, opcional)
              </Label>
              <Input
                id="maintenance-duration"
                type="number"
                min={1}
                max={1440}
                value={maintenanceDuration}
                onChange={(e) => setMaintenanceDuration(e.target.value)}
                placeholder="15"
              />
            </div>
          </div>
        ) : null}

        {type === "maintenance_off" ? (
          <p className="text-sm text-muted-foreground">
            Los usuarios podrán volver a acceder al cliente inmediatamente.
          </p>
        ) : null}

        <DialogFooter>
          <Button variant="ghost" onClick={onCancel} disabled={pending}>
            Cancelar
          </Button>
          <Button onClick={handleConfirm} disabled={pending}>
            {pending ? "Iniciando…" : confirmLabelFor(type)}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}

function descriptionFor(type: ActionType): string {
  switch (type) {
    case "deploy":
      return "Despliega la última versión del cliente.";
    case "restart_pm2":
      return "Reinicia el proceso PM2 sin tocar nada más.";
    case "backup_now":
      return "Genera un pg_dump comprimido en /backups/daily/.";
    case "maintenance_on":
      return "Activa el modo mantenimiento del cliente.";
    case "maintenance_off":
      return "Desactiva el modo mantenimiento del cliente.";
  }
}

function confirmLabelFor(type: ActionType): string {
  switch (type) {
    case "deploy":
      return "Desplegar";
    case "restart_pm2":
      return "Reiniciar";
    case "backup_now":
      return "Crear backup";
    case "maintenance_on":
      return "Activar";
    case "maintenance_off":
      return "Desactivar";
  }
}
