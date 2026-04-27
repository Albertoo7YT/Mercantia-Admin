import Link from "next/link";
import { Plus } from "lucide-react";
import { prisma } from "@/lib/db";
import { Button } from "@/components/ui/button";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";
import { PageHeader } from "@/components/page-header";
import { TenantStatusBadge } from "@/components/tenant-status-badge";
import { HealthIndicator } from "@/components/tenant/health-indicator";
import { formatRelativeDate } from "@/lib/utils";

export const dynamic = "force-dynamic";

async function getTenants() {
  return prisma.tenant.findMany({ orderBy: { createdAt: "desc" } });
}

export default async function TenantsPage() {
  const tenants = await getTenants();

  return (
    <>
      <PageHeader
        title="Clientes"
        description="Gestiona las instancias Mercantia desplegadas."
        actions={
          <Button asChild>
            <Link href="/tenants/new">
              <Plus className="size-4" />
              Añadir cliente
            </Link>
          </Button>
        }
      />

      {tenants.length === 0 ? (
        <div className="rounded-md border border-dashed p-12 text-center">
          <p className="text-sm text-muted-foreground">
            Todavía no hay clientes registrados.
          </p>
          <Button asChild variant="outline" className="mt-4">
            <Link href="/tenants/new">Añadir el primero</Link>
          </Button>
        </div>
      ) : (
        <div className="overflow-hidden rounded-md border bg-card">
          <Table>
            <TableHeader>
              <TableRow>
                <TableHead>Nombre</TableHead>
                <TableHead>Slug</TableHead>
                <TableHead>API URL</TableHead>
                <TableHead>Estado</TableHead>
                <TableHead>Salud</TableHead>
                <TableHead>Creado</TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {tenants.map((t) => (
                <TableRow
                  key={t.id}
                  className="cursor-pointer"
                >
                  <TableCell className="font-medium">
                    <Link
                      href={`/tenants/${t.id}`}
                      className="hover:underline"
                    >
                      {t.name}
                    </Link>
                  </TableCell>
                  <TableCell className="font-mono text-xs text-muted-foreground">
                    {t.slug}
                  </TableCell>
                  <TableCell className="font-mono text-xs text-muted-foreground">
                    {t.apiUrl}
                  </TableCell>
                  <TableCell>
                    <TenantStatusBadge status={t.status} />
                  </TableCell>
                  <TableCell>
                    <HealthIndicator tenantId={t.id} showLabel={false} />
                  </TableCell>
                  <TableCell
                    className="text-xs text-muted-foreground"
                    title={t.createdAt.toISOString()}
                  >
                    {formatRelativeDate(t.createdAt)}
                  </TableCell>
                </TableRow>
              ))}
            </TableBody>
          </Table>
        </div>
      )}
    </>
  );
}
