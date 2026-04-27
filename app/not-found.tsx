import Link from "next/link";
import { Button } from "@/components/ui/button";

export default function NotFound() {
  return (
    <main className="grid min-h-screen place-items-center bg-background">
      <div className="text-center">
        <p className="text-sm font-medium text-muted-foreground">404</p>
        <h1 className="mt-2 text-2xl font-semibold tracking-tight">
          Página no encontrada
        </h1>
        <p className="mt-2 text-sm text-muted-foreground">
          La ruta solicitada no existe en el panel.
        </p>
        <Button asChild className="mt-6">
          <Link href="/">Volver al panel</Link>
        </Button>
      </div>
    </main>
  );
}
