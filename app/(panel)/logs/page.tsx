import Link from "next/link";
import { prisma } from "@/lib/db";
import { Badge } from "@/components/ui/badge";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { Input } from "@/components/ui/input";
import { Button } from "@/components/ui/button";
import { PageHeader } from "@/components/page-header";
import { OperationLogTable } from "@/components/operation-log-table";

export const dynamic = "force-dynamic";

type SearchParams = {
  action?: string;
  status?: string;
  tenantId?: string;
  q?: string;
  limit?: string;
};

type PageProps = { searchParams: Promise<SearchParams> };

const PAGE_SIZE = 100;

export default async function LogsPage({ searchParams }: PageProps) {
  const sp = await searchParams;

  const limit = Math.min(
    Math.max(parseInt(sp.limit ?? `${PAGE_SIZE}`, 10) || PAGE_SIZE, 10),
    500,
  );

  const where: Record<string, unknown> = {};
  if (sp.action && sp.action !== "all") where.action = { contains: sp.action };
  if (sp.status && sp.status !== "all") where.status = sp.status;
  if (sp.tenantId && sp.tenantId !== "all") where.tenantId = sp.tenantId;
  if (sp.q) {
    where.OR = [
      { action: { contains: sp.q } },
      { errorMessage: { contains: sp.q } },
    ];
  }

  const [logs, tenants, actions] = await Promise.all([
    prisma.operationLog.findMany({
      where,
      orderBy: { createdAt: "desc" },
      take: limit,
      include: { tenant: { select: { name: true } } },
    }),
    prisma.tenant.findMany({
      orderBy: { name: "asc" },
      select: { id: true, name: true },
    }),
    prisma.operationLog.groupBy({
      by: ["action"],
      _count: { _all: true },
      orderBy: { _count: { action: "desc" } },
      take: 30,
    }),
  ]);

  const filtered = Boolean(
    (sp.action && sp.action !== "all") ||
      (sp.status && sp.status !== "all") ||
      (sp.tenantId && sp.tenantId !== "all") ||
      sp.q,
  );

  return (
    <>
      <PageHeader
        title="Operaciones"
        description="Auditoría de todas las acciones realizadas en el panel."
      />

      <form
        method="GET"
        className="mb-4 grid grid-cols-1 gap-3 rounded-md border bg-card p-4 sm:grid-cols-5"
      >
        <Input
          name="q"
          placeholder="Buscar (acción, error)…"
          defaultValue={sp.q ?? ""}
          className="sm:col-span-2"
        />
        <Select name="action" defaultValue={sp.action ?? "all"}>
          <SelectTrigger>
            <SelectValue placeholder="Acción" />
          </SelectTrigger>
          <SelectContent>
            <SelectItem value="all">Todas las acciones</SelectItem>
            {actions.map((a) => (
              <SelectItem key={a.action} value={a.action}>
                {a.action}
              </SelectItem>
            ))}
          </SelectContent>
        </Select>
        <Select name="status" defaultValue={sp.status ?? "all"}>
          <SelectTrigger>
            <SelectValue placeholder="Estado" />
          </SelectTrigger>
          <SelectContent>
            <SelectItem value="all">Todos</SelectItem>
            <SelectItem value="success">success</SelectItem>
            <SelectItem value="pending">pending</SelectItem>
            <SelectItem value="error">error</SelectItem>
          </SelectContent>
        </Select>
        <Select name="tenantId" defaultValue={sp.tenantId ?? "all"}>
          <SelectTrigger>
            <SelectValue placeholder="Tenant" />
          </SelectTrigger>
          <SelectContent>
            <SelectItem value="all">Todos los tenants</SelectItem>
            {tenants.map((t) => (
              <SelectItem key={t.id} value={t.id}>
                {t.name}
              </SelectItem>
            ))}
          </SelectContent>
        </Select>
        <div className="flex items-center gap-2 sm:col-span-5 sm:justify-end">
          <Button type="submit">Filtrar</Button>
          {filtered ? (
            <Button asChild type="button" variant="ghost">
              <Link href="/logs">Limpiar</Link>
            </Button>
          ) : null}
          <span className="text-xs text-muted-foreground">
            <Badge variant="muted">{logs.length} resultados</Badge>
          </span>
        </div>
      </form>

      <OperationLogTable
        logs={logs.map((l) => ({
          id: l.id,
          tenantId: l.tenantId,
          tenantName: l.tenant?.name ?? null,
          action: l.action,
          actor: l.actor,
          status: l.status,
          errorMessage: l.errorMessage,
          details: l.details,
          createdAt: l.createdAt,
        }))}
      />
    </>
  );
}
