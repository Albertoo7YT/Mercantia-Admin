import Link from "next/link";
import { Plus } from "lucide-react";
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
import { formatRelativeDate } from "@/lib/utils";

export const dynamic = "force-dynamic";

export default async function BackupTargetsPage() {
  const targets = await prisma.backupTarget.findMany({
    orderBy: [{ isDefault: "desc" }, { createdAt: "desc" }],
  });

  return (
    <>
      <PageHeader
        title="Targets de backup"
        description="Servidores remotos a los que se sincronizan los backups."
        actions={
          <Button asChild>
            <Link href="/backup-targets/new">
              <Plus className="size-4" />
              Añadir target
            </Link>
          </Button>
        }
      />

      {targets.length === 0 ? (
        <div className="rounded-md border border-dashed p-12 text-center">
          <p className="text-sm text-muted-foreground">
            No hay targets configurados.
          </p>
          <Button asChild variant="outline" className="mt-4">
            <Link href="/backup-targets/new">Añadir el primero</Link>
          </Button>
        </div>
      ) : (
        <div className="overflow-hidden rounded-md border bg-card">
          <Table>
            <TableHeader>
              <TableRow>
                <TableHead>Nombre</TableHead>
                <TableHead>Host</TableHead>
                <TableHead>Usuario</TableHead>
                <TableHead>Ruta remota</TableHead>
                <TableHead>Default</TableHead>
                <TableHead>Creado</TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {targets.map((t) => (
                <TableRow key={t.id}>
                  <TableCell className="font-medium">
                    <Link
                      href={`/backup-targets/${t.id}`}
                      className="hover:underline"
                    >
                      {t.name}
                    </Link>
                  </TableCell>
                  <TableCell className="font-mono text-xs">
                    {t.host}:{t.port}
                  </TableCell>
                  <TableCell className="font-mono text-xs">
                    {t.username}
                  </TableCell>
                  <TableCell className="font-mono text-xs text-muted-foreground">
                    {t.remotePath}
                  </TableCell>
                  <TableCell>
                    {t.isDefault ? <Badge variant="success">Sí</Badge> : <span className="text-muted-foreground">—</span>}
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
