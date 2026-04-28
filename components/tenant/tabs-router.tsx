"use client";

import { Tabs } from "@/components/ui/tabs";

/**
 * Wrapper de Tabs que sincroniza el tab activo con `?tab=…` de la URL.
 *
 * - Inicial: se pasa desde el server component leyendo `searchParams.tab`.
 * - Cambios: usa `history.replaceState` para actualizar la URL sin
 *   re-disparar Next router (sin roundtrip al servidor).
 *
 * Así al recargar la página el tab se mantiene, y la URL es compartible.
 */
export function TenantTabsRouter({
  defaultValue,
  children,
}: {
  defaultValue: string;
  children: React.ReactNode;
}) {
  return (
    <Tabs
      defaultValue={defaultValue}
      onValueChange={(value) => {
        if (typeof window === "undefined") return;
        const url = new URL(window.location.href);
        url.searchParams.set("tab", value);
        window.history.replaceState({}, "", url.toString());
      }}
    >
      {children}
    </Tabs>
  );
}
