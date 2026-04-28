"use client";

import { useState } from "react";
import {
  useMutation,
  useQuery,
  useQueryClient,
} from "@tanstack/react-query";
import { Loader2, Plus, Trash2 } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Skeleton } from "@/components/ui/skeleton";
import { Textarea } from "@/components/ui/textarea";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
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
import { Alert, AlertDescription } from "@/components/ui/alert";
import { useToast } from "@/hooks/use-toast";
import { formatEur } from "@/lib/money";
import { formatDate, formatRelativeDate } from "@/lib/utils";

type Payment = {
  id: string;
  tenantId: string;
  amount: number;
  type: string;
  paidAt: string;
  method: string | null;
  notes: string | null;
  reference: string | null;
};

const PAYMENTS_KEY = (id: string) => ["tenant", id, "payments"] as const;

const TYPE_LABELS: Record<string, string> = {
  installation: "Instalación",
  monthly: "Cuota mensual",
  yearly: "Cuota anual",
  other: "Otro",
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

async function postJson<T>(url: string, body: unknown): Promise<T> {
  const res = await fetch(url, {
    method: "POST",
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

async function deleteJson(url: string) {
  const res = await fetch(url, { method: "DELETE" });
  if (!res.ok) throw new Error(`HTTP ${res.status}`);
}

export function PaymentsCard({ tenantId }: { tenantId: string }) {
  const qc = useQueryClient();
  const { toast } = useToast();
  const [open, setOpen] = useState(false);
  const [confirmDelete, setConfirmDelete] = useState<Payment | null>(null);

  const payments = useQuery({
    queryKey: PAYMENTS_KEY(tenantId),
    queryFn: () =>
      getJson<{ payments: Payment[] }>(`/api/tenants/${tenantId}/payments`),
    staleTime: 30_000,
  });

  const create = useMutation({
    mutationFn: (input: {
      amountEuros: number;
      type: string;
      paidAt: string;
      method?: string;
      notes?: string;
      reference?: string;
    }) => postJson<{ payment: Payment }>(`/api/tenants/${tenantId}/payments`, input),
    onSuccess: () => {
      toast({ title: "Pago registrado" });
      setOpen(false);
      qc.invalidateQueries({ queryKey: PAYMENTS_KEY(tenantId) });
    },
    onError: (err) =>
      toast({
        title: "No se pudo registrar el pago",
        description: (err as Error).message,
        variant: "destructive",
      }),
  });

  const remove = useMutation({
    mutationFn: (paymentId: string) =>
      deleteJson(`/api/tenants/${tenantId}/payments/${paymentId}`),
    onSuccess: () => {
      toast({ title: "Pago eliminado" });
      setConfirmDelete(null);
      qc.invalidateQueries({ queryKey: PAYMENTS_KEY(tenantId) });
    },
    onError: (err) =>
      toast({
        title: "No se pudo borrar",
        description: (err as Error).message,
        variant: "destructive",
      }),
  });

  const totalCents = (payments.data?.payments ?? []).reduce(
    (acc, p) => acc + p.amount,
    0,
  );

  return (
    <Card>
      <CardHeader className="flex flex-row items-center justify-between pb-3">
        <div>
          <CardTitle className="text-sm uppercase tracking-wide text-muted-foreground">
            Pagos registrados
          </CardTitle>
          <p className="mt-1 text-xs text-muted-foreground">
            Total acumulado: {formatEur(totalCents)}
          </p>
        </div>
        <Button size="sm" onClick={() => setOpen(true)}>
          <Plus className="size-4" />
          Registrar pago
        </Button>
      </CardHeader>
      <CardContent>
        {payments.isLoading ? (
          <div className="space-y-2">
            {Array.from({ length: 3 }).map((_, i) => (
              <Skeleton key={i} className="h-8 w-full" />
            ))}
          </div>
        ) : payments.isError ? (
          <Alert variant="destructive">
            <AlertDescription>
              No se pudieron cargar los pagos: {(payments.error as Error)?.message}
            </AlertDescription>
          </Alert>
        ) : !payments.data?.payments || payments.data.payments.length === 0 ? (
          <p className="text-sm text-muted-foreground">
            Sin pagos registrados.
          </p>
        ) : (
          <Table>
            <TableHeader>
              <TableRow>
                <TableHead>Fecha</TableHead>
                <TableHead>Tipo</TableHead>
                <TableHead>Importe</TableHead>
                <TableHead>Método</TableHead>
                <TableHead>Referencia</TableHead>
                <TableHead className="text-right" />
              </TableRow>
            </TableHeader>
            <TableBody>
              {payments.data.payments.map((p) => (
                <TableRow key={p.id}>
                  <TableCell
                    className="whitespace-nowrap text-xs text-muted-foreground"
                    title={formatDate(p.paidAt)}
                  >
                    {formatRelativeDate(p.paidAt)}
                  </TableCell>
                  <TableCell className="text-sm">
                    {TYPE_LABELS[p.type] ?? p.type}
                  </TableCell>
                  <TableCell className="tabular-nums">
                    {formatEur(p.amount)}
                  </TableCell>
                  <TableCell className="text-xs text-muted-foreground">
                    {p.method ?? "—"}
                  </TableCell>
                  <TableCell className="text-xs text-muted-foreground">
                    {p.reference ?? "—"}
                  </TableCell>
                  <TableCell className="text-right">
                    <Button
                      variant="ghost"
                      size="icon"
                      onClick={() => setConfirmDelete(p)}
                      aria-label="Eliminar pago"
                    >
                      <Trash2 className="size-3.5" />
                    </Button>
                  </TableCell>
                </TableRow>
              ))}
            </TableBody>
          </Table>
        )}
      </CardContent>

      <PaymentDialog
        open={open}
        onClose={() => setOpen(false)}
        onSubmit={(data) => create.mutate(data)}
        pending={create.isPending}
      />

      <Dialog
        open={confirmDelete !== null}
        onOpenChange={(o) => !o && !remove.isPending && setConfirmDelete(null)}
      >
        <DialogContent>
          <DialogHeader>
            <DialogTitle>¿Eliminar este pago?</DialogTitle>
            <DialogDescription>
              {confirmDelete
                ? `${TYPE_LABELS[confirmDelete.type] ?? confirmDelete.type} · ${formatEur(confirmDelete.amount)} del ${formatDate(confirmDelete.paidAt)}`
                : ""}
            </DialogDescription>
          </DialogHeader>
          <DialogFooter>
            <Button
              variant="ghost"
              onClick={() => setConfirmDelete(null)}
              disabled={remove.isPending}
            >
              Cancelar
            </Button>
            <Button
              variant="destructive"
              onClick={() =>
                confirmDelete && remove.mutate(confirmDelete.id)
              }
              disabled={remove.isPending}
            >
              {remove.isPending ? (
                <Loader2 className="size-4 animate-spin" />
              ) : null}
              Eliminar
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </Card>
  );
}

function todayInput(): string {
  const d = new Date();
  return d.toISOString().slice(0, 10);
}

function PaymentDialog({
  open,
  onClose,
  onSubmit,
  pending,
}: {
  open: boolean;
  onClose: () => void;
  onSubmit: (data: {
    amountEuros: number;
    type: string;
    paidAt: string;
    method?: string;
    notes?: string;
    reference?: string;
  }) => void;
  pending: boolean;
}) {
  const [amount, setAmount] = useState("");
  const [type, setType] = useState("monthly");
  const [paidAt, setPaidAt] = useState(todayInput());
  const [method, setMethod] = useState("");
  const [reference, setReference] = useState("");
  const [notes, setNotes] = useState("");

  function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    const n = Number(amount.replace(",", "."));
    if (!Number.isFinite(n) || n <= 0) return;
    onSubmit({
      amountEuros: n,
      type,
      paidAt,
      method: method.trim() || undefined,
      notes: notes.trim() || undefined,
      reference: reference.trim() || undefined,
    });
  }

  function handleOpenChange(open: boolean) {
    if (!open && !pending) {
      onClose();
      // reset
      setAmount("");
      setType("monthly");
      setPaidAt(todayInput());
      setMethod("");
      setReference("");
      setNotes("");
    }
  }

  return (
    <Dialog open={open} onOpenChange={handleOpenChange}>
      <DialogContent>
        <form onSubmit={handleSubmit}>
          <DialogHeader>
            <DialogTitle>Registrar pago</DialogTitle>
            <DialogDescription>
              Anota un cobro recibido del cliente.
            </DialogDescription>
          </DialogHeader>
          <div className="grid grid-cols-1 gap-3 py-2 sm:grid-cols-2">
            <div className="space-y-1.5">
              <Label htmlFor="payment-amount">Importe (€) *</Label>
              <Input
                id="payment-amount"
                type="text"
                inputMode="decimal"
                pattern="[0-9]+([.,][0-9]{1,2})?"
                placeholder="83"
                value={amount}
                onChange={(e) => setAmount(e.target.value)}
                required
                autoFocus
              />
            </div>
            <div className="space-y-1.5">
              <Label htmlFor="payment-type">Tipo *</Label>
              <Select value={type} onValueChange={setType}>
                <SelectTrigger id="payment-type">
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="installation">Instalación</SelectItem>
                  <SelectItem value="monthly">Cuota mensual</SelectItem>
                  <SelectItem value="yearly">Cuota anual</SelectItem>
                  <SelectItem value="other">Otro</SelectItem>
                </SelectContent>
              </Select>
            </div>
            <div className="space-y-1.5">
              <Label htmlFor="payment-paid-at">Fecha de pago *</Label>
              <Input
                id="payment-paid-at"
                type="date"
                value={paidAt}
                onChange={(e) => setPaidAt(e.target.value)}
                required
              />
            </div>
            <div className="space-y-1.5">
              <Label htmlFor="payment-method">Método</Label>
              <Input
                id="payment-method"
                value={method}
                onChange={(e) => setMethod(e.target.value)}
                placeholder="Transferencia, domiciliación…"
              />
            </div>
            <div className="space-y-1.5 sm:col-span-2">
              <Label htmlFor="payment-reference">Referencia</Label>
              <Input
                id="payment-reference"
                value={reference}
                onChange={(e) => setReference(e.target.value)}
                placeholder="Nº factura, ID transferencia…"
              />
            </div>
            <div className="space-y-1.5 sm:col-span-2">
              <Label htmlFor="payment-notes">Notas</Label>
              <Textarea
                id="payment-notes"
                rows={2}
                maxLength={2000}
                value={notes}
                onChange={(e) => setNotes(e.target.value)}
              />
            </div>
          </div>
          <DialogFooter>
            <Button
              type="button"
              variant="ghost"
              onClick={() => handleOpenChange(false)}
              disabled={pending}
            >
              Cancelar
            </Button>
            <Button
              type="submit"
              disabled={pending || amount.trim() === ""}
            >
              {pending ? <Loader2 className="size-4 animate-spin" /> : null}
              Registrar
            </Button>
          </DialogFooter>
        </form>
      </DialogContent>
    </Dialog>
  );
}
