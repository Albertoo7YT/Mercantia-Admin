"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { Loader2, Receipt } from "lucide-react";
import { Button } from "@/components/ui/button";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { useToast } from "@/hooks/use-toast";

function defaultPeriodMonth(): string {
  const d = new Date();
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}`;
}

export function GenerateInvoicesButton() {
  const router = useRouter();
  const { toast } = useToast();
  const [open, setOpen] = useState(false);
  const [period, setPeriod] = useState(defaultPeriodMonth());
  const [pending, setPending] = useState(false);

  async function generate() {
    setPending(true);
    try {
      const res = await fetch("/api/billing/generate", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ periodMonth: period }),
      });
      const body = (await res.json().catch(() => ({}))) as {
        total?: number;
        created?: number;
        skipped?: number;
        pushOk?: number;
        pushErr?: number;
        error?: string;
      };
      if (!res.ok) throw new Error(body.error ?? `HTTP ${res.status}`);
      toast({
        title: "Facturas generadas",
        description: `Total ${body.total} · Nuevas ${body.created} · Existentes ${body.skipped} · Push OK ${body.pushOk} · Errores ${body.pushErr}`,
      });
      setOpen(false);
      router.refresh();
    } catch (e) {
      toast({
        title: "Falló la generación",
        description: (e as Error).message,
        variant: "destructive",
      });
    } finally {
      setPending(false);
    }
  }

  return (
    <>
      <Button variant="outline" onClick={() => setOpen(true)}>
        <Receipt className="size-4" />
        Generar facturas del mes
      </Button>

      <Dialog open={open} onOpenChange={setOpen}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>Generar facturas mensuales</DialogTitle>
            <DialogDescription>
              Crea (o salta si ya existen) una factura por cada cliente activo
              para el periodo indicado, con el precio mensual efectivo de su
              suscripción. Cada factura se envía automáticamente al cliente.
            </DialogDescription>
          </DialogHeader>
          <div className="space-y-2">
            <Label htmlFor="generate-period">Periodo (YYYY-MM)</Label>
            <Input
              id="generate-period"
              value={period}
              onChange={(e) => setPeriod(e.target.value)}
              placeholder="2026-04"
            />
            <p className="text-xs text-muted-foreground">
              La operación es idempotente: si ya hay factura para un cliente
              en ese mes, no se crea duplicada.
            </p>
          </div>
          <DialogFooter>
            <Button variant="ghost" onClick={() => setOpen(false)} disabled={pending}>
              Cancelar
            </Button>
            <Button
              onClick={generate}
              disabled={
                pending || !/^\d{4}-(0[1-9]|1[0-2])$/.test(period)
              }
            >
              {pending ? <Loader2 className="size-4 animate-spin" /> : null}
              Generar
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </>
  );
}
