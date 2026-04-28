import Link from "next/link";
import { Pencil } from "lucide-react";
import { prisma } from "@/lib/db";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";
import { PageHeader } from "@/components/page-header";
import { formatEur } from "@/lib/money";

export const dynamic = "force-dynamic";

export default async function PlansPage() {
  const plans = await prisma.plan.findMany({
    orderBy: { sortOrder: "asc" },
    include: { _count: { select: { subscriptions: true } } },
  });

  return (
    <>
      <PageHeader
        title="Planes"
        description="Catálogo de planes Mercantia. Edítalos con cuidado, los cambios afectan a los clientes suscritos."
      />

      <div className="overflow-hidden rounded-md border bg-card">
        <Table>
          <TableHeader>
            <TableRow>
              <TableHead>Slug</TableHead>
              <TableHead>Nombre</TableHead>
              <TableHead>Mensual</TableHead>
              <TableHead>Anual</TableHead>
              <TableHead>Comerciales</TableHead>
              <TableHead>Oficina</TableHead>
              <TableHead>Admins</TableHead>
              <TableHead>Multi-almacén</TableHead>
              <TableHead>API</TableHead>
              <TableHead>Suscripciones</TableHead>
              <TableHead className="text-right" />
            </TableRow>
          </TableHeader>
          <TableBody>
            {plans.map((p) => (
              <TableRow key={p.id}>
                <TableCell className="font-mono text-xs text-muted-foreground">
                  {p.slug}
                </TableCell>
                <TableCell className="font-medium">
                  {p.name}
                  {p.isPopular ? (
                    <Badge variant="warning" className="ml-2">
                      Popular
                    </Badge>
                  ) : null}
                  {!p.active ? (
                    <Badge variant="muted" className="ml-2">
                      Inactivo
                    </Badge>
                  ) : null}
                </TableCell>
                <TableCell className="tabular-nums">
                  {formatEur(p.monthlyPrice)}
                </TableCell>
                <TableCell className="tabular-nums">
                  {formatEur(p.yearlyPrice)}
                </TableCell>
                <TableCell className="tabular-nums">{p.maxSales}</TableCell>
                <TableCell className="tabular-nums">{p.maxOffice}</TableCell>
                <TableCell className="tabular-nums">{p.maxAdmins}</TableCell>
                <TableCell>{p.multiWarehouse ? "Sí" : "—"}</TableCell>
                <TableCell>{p.apiAccess ? "Sí" : "—"}</TableCell>
                <TableCell className="tabular-nums">
                  {p._count.subscriptions}
                </TableCell>
                <TableCell className="text-right">
                  <Button asChild size="sm" variant="ghost">
                    <Link href={`/plans/${p.id}/edit`}>
                      <Pencil className="size-3.5" />
                      Editar
                    </Link>
                  </Button>
                </TableCell>
              </TableRow>
            ))}
          </TableBody>
        </Table>
      </div>
    </>
  );
}
