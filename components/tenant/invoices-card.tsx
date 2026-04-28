"use client";

import { useMemo, useState } from "react";
import {
  useMutation,
  useQuery,
  useQueryClient,
} from "@tanstack/react-query";
import {
  Check,
  CheckCircle2,
  CircleAlert,
  Clock,
  Cloud,
  Loader2,
  Plus,
  RefreshCw,
  Trash2,
  X,
} from "lucide-react";
import { Button } from "@/components/ui/button";
import {
  Card,
  CardContent,
  CardHeader,
  CardTitle,
} from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
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
import { Skeleton } from "@/components/ui/skeleton";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";
import { useToast } from "@/hooks/use-toast";
import { centsToEuros, eurosToCents, formatEur } from "@/lib/money";
import { formatDate, formatRelativeDate } from "@/lib/utils";

type Invoice = {
  id: string;
  number: string;
  periodMonth: string;
  amountCents: number;
  status: "pending" | "paid" | "cancelled";
  issuedAt: string;
  dueDate: string | null;
  paidAt: string | null;
  paymentMethod: string | null;
  paymentReference: string | null;
  notes: string | null;
  syncedAt: string | null;
  syncStatus: string | null;
  syncError: string | null;
};

const KEY = (id: string) => ["tenant", id, "invoices"] as const;

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

async function jsonRequest(url: string, method: string, body?: unknown) {
  const res = await fetch(url, {
    method,
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

function defaultPeriodMonth(): string {
  const d = new Date();
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}`;
}

function formatPeriod(period: string): string {
  const [y, m] = period.split("-").map((s) => parseInt(s, 10));
  if (!y || !m) return period;
  const date = new Date(Date.UTC(y, m - 1, 1));
  return date.toLocaleDateString("es-ES", { month: "long", year: "numeric" });
}

export function InvoicesCard({ tenantId }: { tenantId: string }) {
  const qc = useQueryClient();
  const { toast } = useToast();

  const invoices = useQuery({
    queryKey: KEY(tenantId),
    queryFn: () =>
      getJson<{ invoices: Invoice[] }>(`/api/tenants/${tenantId}/invoices`),
    staleTime: 15_000,
  });

  const [createOpen, setCreateOpen] = useState(false);
  const [draft, setDraft] = useState({
    periodMonth: defaultPeriodMonth(),
    amountEuros: "",
    notes: "",
  });

  const create = useMutation({
    mutationFn: () =>
      jsonRequest(`/api/tenants/${tenantId}/invoices`, "POST", {
        periodMonth: draft.periodMonth,
        amountCents: eurosToCents(draft.amountEuros),
        notes: draft.notes || null,
      }),
    onSuccess: () => {
      toast({ title: "Factura creada y enviada al cliente" });
      qc.invalidateQueries({ queryKey: KEY(tenantId) });
      setCreateOpen(false);
      setDraft({ periodMonth: defaultPeriodMonth(), amountEuros: "", notes: "" });
    },
    onError: (e) =>
      toast({
        title: "No se pudo crear la factura",
        description: (e as Error).message,
        variant: "destructive",
      }),
  });

  const markPaid = useMutation({
    mutationFn: (invoice: Invoice) =>
      jsonRequest(
        `/api/tenants/${tenantId}/invoices/${invoice.id}`,
        "PATCH",
        { status: "paid" },
      ),
    onSuccess: () => {
      toast({ title: "Factura marcada como pagada" });
      qc.invalidateQueries({ queryKey: KEY(tenantId) });
    },
    onError: (e) =>
      toast({
        title: "No se pudo marcar como pagada",
        description: (e as Error).message,
        variant: "destructive",
      }),
  });

  const markPending = useMutation({
    mutationFn: (invoice: Invoice) =>
      jsonRequest(
        `/api/tenants/${tenantId}/invoices/${invoice.id}`,
        "PATCH",
        { status: "pending" },
      ),
    onSuccess: () => {
      toast({ title: "Factura marcada como pendiente" });
      qc.invalidateQueries({ queryKey: KEY(tenantId) });
    },
    onError: (e) =>
      toast({
        title: "No se pudo marcar como pendiente",
        description: (e as Error).message,
        variant: "destructive",
      }),
  });

  const resync = useMutation({
    mutationFn: (invoice: Invoice) =>
      jsonRequest(
        `/api/tenants/${tenantId}/invoices/${invoice.id}/sync`,
        "POST",
      ),
    onSuccess: () => {
      toast({ title: "Resincronizada" });
      qc.invalidateQueries({ queryKey: KEY(tenantId) });
    },
    onError: (e) =>
      toast({
        title: "Falló la resincronización",
        description: (e as Error).message,
        variant: "destructive",
      }),
  });

  const [toDelete, setToDelete] = useState<Invoice | null>(null);
  const remove = useMutation({
    mutationFn: (invoice: Invoice) =>
      jsonRequest(
        `/api/tenants/${tenantId}/invoices/${invoice.id}`,
        "DELETE",
      ),
    onSuccess: () => {
      toast({ title: "Factura eliminada" });
      qc.invalidateQueries({ queryKey: KEY(tenantId) });
      setToDelete(null);
    },
    onError: (e) =>
      toast({
        title: "No se pudo eliminar",
        description: (e as Error).message,
        variant: "destructive",
      }),
  });

  const rows = invoices.data?.invoices ?? [];

  const totals = useMemo(() => {
    const pending = rows
      .filter((r) => r.status === "pending")
      .reduce((acc, r) => acc + r.amountCents, 0);
    const paid = rows
      .filter((r) => r.status === "paid")
      .reduce((acc, r) => acc + r.amountCents, 0);
    return { pending, paid };
  }, [rows]);

  return (
    <Card>
      <CardHeader className="flex flex-row items-center justify-between gap-2">
        <CardTitle className="text-sm uppercase tracking-wide text-muted-foreground">
          Facturas mensuales
        </CardTitle>
        <Button size="sm" onClick={() => setCreateOpen(true)}>
          <Plus className="size-4" />
          Nueva factura
        </Button>
      </CardHeader>
      <CardContent className="space-y-3">
        <div className="grid grid-cols-2 gap-2 text-sm">
          <div className="rounded-md border bg-amber-50/40 p-2 dark:bg-amber-950/10">
            <div className="text-xs text-muted-foreground">Pendiente</div>
            <div className="font-semibold tabular-nums">{formatEur(totals.pending)}</div>
          </div>
          <div className="rounded-md border bg-emerald-50/40 p-2 dark:bg-emerald-950/10">
            <div className="text-xs text-muted-foreground">Cobrado</div>
            <div className="font-semibold tabular-nums">{formatEur(totals.paid)}</div>
          </div>
        </div>

        {invoices.isLoading ? (
          <div className="space-y-2">
            <Skeleton className="h-8 w-full" />
            <Skeleton className="h-8 w-full" />
          </div>
        ) : rows.length === 0 ? (
          <p className="text-center text-sm text-muted-foreground py-6">
            No hay facturas todavía. Crea la primera con "Nueva factura".
          </p>
        ) : (
          <div className="overflow-hidden rounded-md border">
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead>Periodo</TableHead>
                  <TableHead>Importe</TableHead>
                  <TableHead>Estado</TableHead>
                  <TableHead>Vencimiento</TableHead>
                  <TableHead>Pagada</TableHead>
                  <TableHead>Sync</TableHead>
                  <TableHead className="text-right" />
                </TableRow>
              </TableHeader>
              <TableBody>
                {rows.map((r) => (
                  <TableRow key={r.id}>
                    <TableCell>
                      <div className="font-medium capitalize">{formatPeriod(r.periodMonth)}</div>
                      <div className="font-mono text-[10px] text-muted-foreground">
                        {r.number}
                      </div>
                    </TableCell>
                    <TableCell className="tabular-nums font-medium">
                      {formatEur(r.amountCents)}
                    </TableCell>
                    <TableCell>
                      <StatusBadge status={r.status} />
                    </TableCell>
                    <TableCell
                      className="text-xs text-muted-foreground"
                      title={r.dueDate ? formatDate(r.dueDate) : ""}
                    >
                      {r.dueDate ? formatRelativeDate(r.dueDate) : "—"}
                    </TableCell>
                    <TableCell
                      className="text-xs text-muted-foreground"
                      title={r.paidAt ? formatDate(r.paidAt) : ""}
                    >
                      {r.paidAt ? formatRelativeDate(r.paidAt) : "—"}
                    </TableCell>
                    <TableCell>
                      <SyncBadge invoice={r} />
                    </TableCell>
                    <TableCell className="text-right">
                      <div className="flex justify-end gap-1">
                        {r.status !== "paid" ? (
                          <Button
                            size="sm"
                            variant="ghost"
                            disabled={markPaid.isPending}
                            onClick={() => markPaid.mutate(r)}
                            title="Marcar como pagada"
                          >
                            <Check className="size-3.5" />
                            Pagada
                          </Button>
                        ) : (
                          <Button
                            size="sm"
                            variant="ghost"
                            disabled={markPending.isPending}
                            onClick={() => markPending.mutate(r)}
                            title="Volver a pendiente"
                          >
                            <X className="size-3.5" />
                            Pendiente
                          </Button>
                        )}
                        {r.syncStatus !== "ok" ? (
                          <Button
                            size="sm"
                            variant="ghost"
                            disabled={resync.isPending}
                            onClick={() => resync.mutate(r)}
                            title="Reintentar envío al cliente"
                          >
                            {resync.isPending ? (
                              <Loader2 className="size-3.5 animate-spin" />
                            ) : (
                              <RefreshCw className="size-3.5" />
                            )}
                          </Button>
                        ) : null}
                        <Button
                          size="sm"
                          variant="ghost"
                          onClick={() => setToDelete(r)}
                        >
                          <Trash2 className="size-3.5" />
                        </Button>
                      </div>
                    </TableCell>
                  </TableRow>
                ))}
              </TableBody>
            </Table>
          </div>
        )}
      </CardContent>

      {/* Crear */}
      <Dialog open={createOpen} onOpenChange={setCreateOpen}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>Nueva factura mensual</DialogTitle>
            <DialogDescription>
              Se creará en el panel y se enviará al cliente para que la vea en
              su sección de facturación.
            </DialogDescription>
          </DialogHeader>
          <div className="grid gap-3">
            <div className="space-y-1">
              <Label htmlFor="period">Periodo (YYYY-MM)</Label>
              <Input
                id="period"
                value={draft.periodMonth}
                onChange={(e) =>
                  setDraft({ ...draft, periodMonth: e.target.value })
                }
                placeholder="2026-04"
              />
            </div>
            <div className="space-y-1">
              <Label htmlFor="amount">Importe (€)</Label>
              <Input
                id="amount"
                type="text"
                inputMode="decimal"
                pattern="[0-9]+([.,][0-9]{1,2})?"
                value={draft.amountEuros}
                onChange={(e) =>
                  setDraft({ ...draft, amountEuros: e.target.value })
                }
                placeholder="49,00"
              />
            </div>
            <div className="space-y-1">
              <Label htmlFor="notes">Notas</Label>
              <Textarea
                id="notes"
                rows={2}
                maxLength={500}
                value={draft.notes}
                onChange={(e) => setDraft({ ...draft, notes: e.target.value })}
              />
            </div>
          </div>
          <DialogFooter>
            <Button variant="ghost" onClick={() => setCreateOpen(false)}>
              Cancelar
            </Button>
            <Button
              onClick={() => create.mutate()}
              disabled={
                create.isPending ||
                draft.amountEuros === "" ||
                !/^\d{4}-(0[1-9]|1[0-2])$/.test(draft.periodMonth)
              }
            >
              {create.isPending ? <Loader2 className="size-4 animate-spin" /> : null}
              Crear y enviar
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* Borrar */}
      <Dialog
        open={toDelete !== null}
        onOpenChange={(o) => !o && setToDelete(null)}
      >
        <DialogContent>
          <DialogHeader>
            <DialogTitle>¿Eliminar factura?</DialogTitle>
            <DialogDescription>
              {toDelete ? (
                <>
                  {formatPeriod(toDelete.periodMonth)} · {formatEur(toDelete.amountCents)}.
                  También se eliminará en el cliente. No se puede deshacer.
                </>
              ) : null}
            </DialogDescription>
          </DialogHeader>
          <DialogFooter>
            <Button variant="ghost" onClick={() => setToDelete(null)}>
              Cancelar
            </Button>
            <Button
              variant="destructive"
              onClick={() => toDelete && remove.mutate(toDelete)}
              disabled={remove.isPending}
            >
              {remove.isPending ? <Loader2 className="size-4 animate-spin" /> : null}
              Eliminar
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </Card>
  );
}

function StatusBadge({ status }: { status: Invoice["status"] }) {
  if (status === "paid")
    return (
      <Badge variant="success">
        <CheckCircle2 className="size-3" />
        Pagada
      </Badge>
    );
  if (status === "cancelled")
    return <Badge variant="muted">Cancelada</Badge>;
  return (
    <Badge variant="warning">
      <Clock className="size-3" />
      Pendiente
    </Badge>
  );
}

function SyncBadge({ invoice }: { invoice: Invoice }) {
  if (invoice.syncStatus === "ok")
    return (
      <span
        className="inline-flex items-center gap-1 text-xs text-emerald-600"
        title={`Sincronizada ${invoice.syncedAt ? formatDate(invoice.syncedAt) : ""}`}
      >
        <Cloud className="size-3" />
        OK
      </span>
    );
  if (invoice.syncStatus === "error")
    return (
      <span
        className="inline-flex items-center gap-1 text-xs text-destructive"
        title={invoice.syncError ?? ""}
      >
        <CircleAlert className="size-3" />
        Error
      </span>
    );
  return (
    <span className="text-xs text-muted-foreground">
      <Clock className="inline size-3" /> ...
    </span>
  );
}
