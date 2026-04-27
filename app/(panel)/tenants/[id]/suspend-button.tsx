"use client";

import { useTransition } from "react";
import { Ban, Loader2 } from "lucide-react";
import { Button } from "@/components/ui/button";
import { useToast } from "@/hooks/use-toast";
import { suspendTenant } from "../actions";

export function SuspendButton({ id, status }: { id: string; status: string }) {
  const { toast } = useToast();
  const [pending, startTransition] = useTransition();

  if (status === "suspended") return null;

  function onClick() {
    if (!confirm("¿Suspender este cliente? No se borra de la base de datos.")) return;
    startTransition(async () => {
      const res = await suspendTenant(id);
      if (res.ok) {
        toast({ title: "Cliente suspendido" });
      } else {
        toast({
          title: "No se pudo suspender",
          description: res.error,
          variant: "destructive",
        });
      }
    });
  }

  return (
    <Button variant="ghost" onClick={onClick} disabled={pending}>
      {pending ? (
        <Loader2 className="size-4 animate-spin" />
      ) : (
        <Ban className="size-4" />
      )}
      Suspender
    </Button>
  );
}
