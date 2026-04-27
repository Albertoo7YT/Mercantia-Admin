import Link from "next/link";
import { notFound } from "next/navigation";
import { Pencil } from "lucide-react";
import { prisma } from "@/lib/db";
import { Button } from "@/components/ui/button";
import { Card, CardContent } from "@/components/ui/card";
import {
  Tabs,
  TabsContent,
  TabsList,
  TabsTrigger,
} from "@/components/ui/tabs";
import { PageHeader } from "@/components/page-header";
import { TenantStatusBadge } from "@/components/tenant-status-badge";
import { HealthIndicator } from "@/components/tenant/health-indicator";
import { ModulesTab } from "@/components/tenant/modules-tab";
import { OperationLogTable } from "@/components/operation-log-table";
import { SuspendButton } from "./suspend-button";

export const dynamic = "force-dynamic";

type PageProps = { params: Promise<{ id: string }> };

async function getTenant(id: string) {
  return prisma.tenant.findUnique({
    where: { id },
    include: {
      logs: {
        orderBy: { createdAt: "desc" },
        take: 50,
      },
    },
  });
}

export default async function TenantDetailPage({ params }: PageProps) {
  const { id } = await params;
  const tenant = await getTenant(id);
  if (!tenant) notFound();

  return (
    <>
      <PageHeader
        title={tenant.name}
        description={
          <span className="flex items-center gap-3">
            <span className="font-mono text-xs">{tenant.slug}</span>
            <TenantStatusBadge status={tenant.status} />
            <HealthIndicator tenantId={tenant.id} />
          </span>
        }
        actions={
          <>
            <SuspendButton id={tenant.id} status={tenant.status} />
            <Button asChild variant="outline">
              <Link href={`/tenants/${tenant.id}/edit`}>
                <Pencil className="size-4" />
                Editar
              </Link>
            </Button>
          </>
        }
      />

      <Tabs defaultValue="modules">
        <TabsList>
          <TabsTrigger value="modules">Módulos</TabsTrigger>
          <TabsTrigger value="info">Info</TabsTrigger>
          <TabsTrigger value="backups">Backups</TabsTrigger>
          <TabsTrigger value="branding">Branding</TabsTrigger>
          <TabsTrigger value="operations">Operaciones</TabsTrigger>
        </TabsList>

        <TabsContent value="modules">
          <ModulesTab tenantId={tenant.id} />
        </TabsContent>
        <TabsContent value="info">
          <Placeholder
            title="Información del sistema"
            description="Datos de versión, base de datos y entorno. Próximamente."
          />
        </TabsContent>
        <TabsContent value="backups">
          <Placeholder
            title="Backups"
            description="Crear, listar y restaurar copias del tenant. Próximamente."
          />
        </TabsContent>
        <TabsContent value="branding">
          <Placeholder
            title="Branding"
            description="Configurar colores, logo y nombre. Próximamente."
          />
        </TabsContent>
        <TabsContent value="operations">
          <OperationLogTable
            logs={tenant.logs.map((l) => ({
              id: l.id,
              tenantId: l.tenantId,
              action: l.action,
              actor: l.actor,
              status: l.status,
              errorMessage: l.errorMessage,
              details: l.details,
              createdAt: l.createdAt,
            }))}
            showTenant={false}
            emptyMessage="Sin operaciones para este cliente."
          />
        </TabsContent>
      </Tabs>
    </>
  );
}

function Placeholder({ title, description }: { title: string; description: string }) {
  return (
    <Card>
      <CardContent className="py-16 text-center">
        <h3 className="text-base font-medium">{title}</h3>
        <p className="mt-2 text-sm text-muted-foreground">{description}</p>
      </CardContent>
    </Card>
  );
}
