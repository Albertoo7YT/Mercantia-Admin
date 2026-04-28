export type ActionType =
  | "deploy"
  | "restart_pm2"
  | "backup_now"
  | "maintenance_on"
  | "maintenance_off";

export const ACTION_TYPES: ActionType[] = [
  "deploy",
  "restart_pm2",
  "backup_now",
  "maintenance_on",
  "maintenance_off",
];

export type ActionStatus = "pending" | "running" | "completed" | "failed";

export interface AdminAction {
  id: string;
  type: ActionType | string;
  status: ActionStatus | string;
  startedAt?: string;
  completedAt?: string;
  durationMs?: number;
  exitCode?: number;
  errorMessage?: string;
  metadata?: Record<string, unknown> | null;
  createdAt: string;
}

export interface ActionLogChunk {
  /** Echoes the requested fromLine. */
  fromLine: number;
  /** Cursor to use for the next request. */
  nextLine: number;
  /** Total lines available so far (not the lines returned). */
  totalLines: number;
  /** Raw text lines starting at fromLine. */
  lines: string[];
  /** True when the action has finished and all lines are returned. */
  done: boolean;
}

export interface MaintenanceStatus {
  active: boolean;
  since?: string | null;
  message?: string | null;
  expectedDurationMinutes?: number | null;
}

export const ACTION_LABELS: Record<ActionType, string> = {
  deploy: "Actualizar app (deploy)",
  restart_pm2: "Reiniciar PM2",
  backup_now: "Crear backup ahora",
  maintenance_on: "Activar mantenimiento",
  maintenance_off: "Desactivar mantenimiento",
};

export const ACTION_DESCRIPTIONS: Record<ActionType, string> = {
  deploy: "Tira de Git, ejecuta tests, aplica migraciones y reinicia la app.",
  restart_pm2: "Reinicia el proceso sin tocar nada más.",
  backup_now: "Genera pg_dump comprimido en /backups/daily/.",
  maintenance_on: "Bloquea acceso a usuarios; deja la API admin viva.",
  maintenance_off: "Desactiva el modo mantenimiento.",
};

export function isTerminalStatus(status: string): boolean {
  return status === "completed" || status === "failed";
}
