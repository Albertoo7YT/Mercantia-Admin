"use client";

import { useEffect, useMemo, useRef, useState } from "react";
import {
  useMutation,
  useQuery,
  useQueryClient,
} from "@tanstack/react-query";
import {
  CloudUpload,
  Database,
  Loader2,
  RotateCcw,
  RotateCw,
  Trash2,
} from "lucide-react";
import { Button } from "@/components/ui/button";
import { Skeleton } from "@/components/ui/skeleton";
import { ErrorState } from "@/components/ui/error-state";
import { EmptyState } from "@/components/ui/empty-state";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { Alert, AlertDescription, AlertTitle } from "@/components/ui/alert";
import { useToast } from "@/hooks/use-toast";
import {
  cn,
  formatBytes,
  formatDate,
  formatRelativeDate,
} from "@/lib/utils";

const BACKUPS_KEY = (id: string) => ["tenant", id, "backups"] as const;

type BackupItem = {
  id?: string;
  filename: string;
  sizeBytes: number;
  createdAt: string;
  type?: string;
};

type BackupsResponse = {
  backups: BackupItem[];
};

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

async function postJson(url: string, body?: unknown) {
  const res = await fetch(url, {
    method: "POST",
    headers: body !== undefined ? { "Content-Type": "application/json" } : undefined,
    body: body !== undefined ? JSON.stringify(body) : undefined,
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
  return res.json().catch(() => ({}));
}

export function BackupsTab({ tenantId }: { tenantId: string }) {
  const qc = useQueryClient();
  const { toast } = useToast();

  const backups = useQuery({
    queryKey: BACKUPS_KEY(tenantId),
    queryFn: () =>
      getJson<BackupsResponse>(`/api/tenants/${tenantId}/backups`),
    staleTime: 15_000,
    refetchOnWindowFocus: true,
  });

  const baselineBeforeBackup = useRef<Set<string> | null>(null);
  const autoSyncedFilenames = useRef<Set<string>>(new Set());
  const [syncingFilename, setSyncingFilename] = useState<string | null>(null);

  const sync = useMutation({
    mutationFn: (filename: string) =>
      postJson(`/api/tenants/${tenantId}/backups/sync`, { filename }),
    onMutate: (filename) => setSyncingFilename(filename),
    onSettled: () => setSyncingFilename(null),
    onSuccess: (_data, filename) => {
      toast({
        title: "Backup sincronizado",
        description: `${filename} subido al target remoto.`,
      });
    },
    onError: (err, filename) => {
      toast({
        title: "Falló la sincronización",
        description: `${filename}: ${(err as Error).message}`,
        variant: "destructive",
      });
    },
  });

  const create = useMutation({
    mutationFn: () =>
      postJson(`/api/tenants/${tenantId}/actions`, {
        type: "backup_now",
      }),
    onSuccess: () => {
      toast({
        title: "Backup en marcha",
        description:
          "Aparecerá en la lista cuando termine. Si hay target por defecto, se subirá solo.",
      });
      // Capturamos snapshot para detectar el nuevo fichero al refrescar
      baselineBeforeBackup.current = new Set(
        (backups.data?.backups ?? []).map((b) => b.filename),
      );
      setTimeout(() => qc.invalidateQueries({ queryKey: BACKUPS_KEY(tenantId) }), 5_000);
      setTimeout(() => qc.invalidateQueries({ queryKey: BACKUPS_KEY(tenantId) }), 15_000);
      setTimeout(() => qc.invalidateQueries({ queryKey: BACKUPS_KEY(tenantId) }), 30_000);
    },
    onError: (err) => {
      toast({
        title: "No se pudo iniciar el backup",
        description: (err as Error).message,
        variant: "destructive",
      });
    },
  });

  // Auto-sync: cuando aparece un fichero nuevo después de backup_now, lo subimos
  useEffect(() => {
    const baseline = baselineBeforeBackup.current;
    if (!baseline) return;
    const current = backups.data?.backups ?? [];
    const newOnes = current.filter(
      (b) => !baseline.has(b.filename) && !autoSyncedFilenames.current.has(b.filename),
    );
    if (newOnes.length === 0) return;
    // Sólo el más reciente
    const newest = [...newOnes].sort(
      (a, b) => new Date(b.createdAt).getTime() - new Date(a.createdAt).getTime(),
    )[0];
    autoSyncedFilenames.current.add(newest.filename);
    sync.mutate(newest.filename);
    baselineBeforeBackup.current = null;
  }, [backups.data, sync]);

  const [restoreTarget, setRestoreTarget] = useState<BackupItem | null>(null);
  const restore = useMutation({
    mutationFn: (filename: string) =>
      postJson(
        `/api/tenants/${tenantId}/backups/${encodeURIComponent(filename)}/restore`,
      ),
    onSuccess: () => {
      toast({
        title: "Restauración en marcha",
        description: "El cliente está aplicando el backup.",
      });
      setRestoreTarget(null);
    },
    onError: (err) => {
      toast({
        title: "No se pudo restaurar",
        description: (err as Error).message,
        variant: "destructive",
      });
    },
  });

  const rows = useMemo(() => {
    const list = backups.data?.backups ?? [];
    return [...list].sort((a, b) =>
      new Date(b.createdAt).getTime() - new Date(a.createdAt).getTime(),
    );
  }, [backups.data]);

  const totalSize = useMemo(
    () => rows.reduce((acc, b) => acc + (b.sizeBytes || 0), 0),
    [rows],
  );

  return (
    <div className="space-y-4">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <div>
          <h2 className="text-base font-medium">Backups del cliente</h2>
          <p className="text-xs text-muted-foreground">
            {rows.length} backup{rows.length === 1 ? "" : "s"} ·{" "}
            {formatBytes(totalSize)} en total
          </p>
        </div>
        <div className="flex gap-2">
          <Button
            size="sm"
            variant="outline"
            onClick={() => backups.refetch()}
            disabled={backups.isFetching}
          >
            <RotateCw
              className={cn("size-4", backups.isFetching && "animate-spin")}
            />
            Refrescar
          </Button>
          <Button
            size="sm"
            onClick={() => create.mutate()}
            disabled={create.isPending}
          >
            {create.isPending ? (
              <Loader2 className="size-4 animate-spin" />
            ) : (
              <Database className="size-4" />
            )}
            Crear backup ahora
          </Button>
        </div>
      </div>

      {backups.isLoading ? (
        <div className="space-y-2">
          {Array.from({ length: 5 }).map((_, i) => (
            <Skeleton key={i} className="h-10 w-full" />
          ))}
        </div>
      ) : backups.isError ? (
        <ErrorState
          title="No se pudieron cargar los backups"
          description="Verifica que el cliente exponga GET /api/admin/system/backups."
          onRetry={() => backups.refetch()}
          retrying={backups.isFetching}
          technicalDetail={(backups.error as Error)?.message}
        />
      ) : rows.length === 0 ? (
        <EmptyState
          title="No hay backups todavía"
          description="Pulsa 'Crear backup ahora' para generar el primero."
        />
      ) : (
        <div className="overflow-hidden rounded-md border bg-card">
          <Table>
            <TableHeader>
              <TableRow>
                <TableHead>Fichero</TableHead>
                <TableHead>Tamaño</TableHead>
                <TableHead>Creado</TableHead>
                <TableHead className="text-right" />
              </TableRow>
            </TableHeader>
            <TableBody>
              {rows.map((b) => (
                <TableRow key={b.id ?? b.filename}>
                  <TableCell
                    className="font-mono text-xs"
                    title={b.filename}
                  >
                    <div className="max-w-[28rem] truncate">{b.filename}</div>
                  </TableCell>
                  <TableCell className="tabular-nums text-xs">
                    {formatBytes(b.sizeBytes)}
                  </TableCell>
                  <TableCell
                    className="text-xs text-muted-foreground whitespace-nowrap"
                    title={formatDate(b.createdAt)}
                  >
                    {formatRelativeDate(b.createdAt)}
                  </TableCell>
                  <TableCell className="text-right">
                    <div className="flex justify-end gap-1">
                      <Button
                        size="sm"
                        variant="ghost"
                        onClick={() => sync.mutate(b.filename)}
                        disabled={
                          syncingFilename !== null && syncingFilename !== b.filename
                        }
                        title="Subir al target remoto"
                      >
                        {syncingFilename === b.filename ? (
                          <Loader2 className="size-3.5 animate-spin" />
                        ) : (
                          <CloudUpload className="size-3.5" />
                        )}
                        Sync
                      </Button>
                      <Button
                        size="sm"
                        variant="ghost"
                        onClick={() => setRestoreTarget(b)}
                        disabled={restore.isPending}
                      >
                        <RotateCcw className="size-3.5" />
                        Restaurar
                      </Button>
                    </div>
                  </TableCell>
                </TableRow>
              ))}
            </TableBody>
          </Table>
        </div>
      )}

      <Dialog
        open={restoreTarget !== null}
        onOpenChange={(open) => !open && !restore.isPending && setRestoreTarget(null)}
      >
        <DialogContent>
          <DialogHeader>
            <DialogTitle>¿Restaurar este backup?</DialogTitle>
            <DialogDescription>
              <span className="font-mono text-xs">{restoreTarget?.filename}</span>
            </DialogDescription>
          </DialogHeader>
          <Alert variant="destructive">
            <Trash2 className="size-4" />
            <AlertTitle>Acción destructiva</AlertTitle>
            <AlertDescription>
              Esto va a sobrescribir la BD del cliente con el contenido de este
              fichero. Los datos posteriores al backup se perderán. Asegúrate de
              que tienes un backup más reciente como red de seguridad.
            </AlertDescription>
          </Alert>
          <DialogFooter>
            <Button
              variant="ghost"
              onClick={() => setRestoreTarget(null)}
              disabled={restore.isPending}
            >
              Cancelar
            </Button>
            <Button
              variant="destructive"
              onClick={() =>
                restoreTarget && restore.mutate(restoreTarget.filename)
              }
              disabled={restore.isPending}
            >
              {restore.isPending ? (
                <Loader2 className="size-4 animate-spin" />
              ) : null}
              Restaurar
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  );
}
