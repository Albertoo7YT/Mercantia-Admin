"use client";

import { useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { Cloud, Loader2 } from "lucide-react";
import { Button } from "@/components/ui/button";
import { useToast } from "@/hooks/use-toast";

export function BulkSyncButton({ tenantIds }: { tenantIds: string[] }) {
  const { toast } = useToast();
  const router = useRouter();
  const [pending, setPending] = useState(false);
  const [, startTransition] = useTransition();

  async function handleClick() {
    if (tenantIds.length === 0) return;
    if (
      !confirm(
        `Sincronizar el plan de ${tenantIds.length} cliente${
          tenantIds.length === 1 ? "" : "s"
        } desincronizado${tenantIds.length === 1 ? "" : "s"}?`,
      )
    ) {
      return;
    }
    setPending(true);
    let ok = 0;
    let failed = 0;
    await Promise.all(
      tenantIds.map(async (id) => {
        try {
          const res = await fetch(`/api/tenants/${id}/plan/sync`, {
            method: "POST",
          });
          if (res.ok) ok += 1;
          else failed += 1;
        } catch {
          failed += 1;
        }
      }),
    );
    setPending(false);
    if (failed === 0) {
      toast({ title: `${ok} cliente${ok === 1 ? "" : "s"} sincronizado${ok === 1 ? "" : "s"}` });
    } else {
      toast({
        title: `${ok} OK / ${failed} fallidos`,
        variant: failed > 0 ? "destructive" : "default",
      });
    }
    startTransition(() => router.refresh());
  }

  return (
    <Button onClick={handleClick} disabled={pending}>
      {pending ? (
        <Loader2 className="size-4 animate-spin" />
      ) : (
        <Cloud className="size-4" />
      )}
      Sincronizar {tenantIds.length} desincronizado
      {tenantIds.length === 1 ? "" : "s"}
    </Button>
  );
}
