import Link from "next/link";
import { notFound } from "next/navigation";
import { Palette, Pencil, ScrollText, Tag, Wrench } from "lucide-react";
import { prisma } from "@/lib/db";
import { Button } from "@/components/ui/button";
import { Card, CardContent } from "@/components/ui/card";
import { TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { TenantTabsRouter } from "@/components/tenant/tabs-router";
import { PageHeader } from "@/components/page-header";
import { TenantStatusBadge } from "@/components/tenant-status-badge";
import { HealthIndicator } from "@/components/tenant/health-indicator";
import { ModulesTab } from "@/components/tenant/modules-tab";
import { LogsTab } from "@/components/tenant/logs-tab";
import { ActionsTab } from "@/components/tenant/actions-tab";
import { BrandingTab } from "@/components/tenant/branding-tab";
import { TicketsTab } from "@/components/tenant/tickets-tab";
import { TicketsTabTrigger } from "@/components/tenant/tickets-tab-trigger";
import { SubscriptionTab } from "@/components/tenant/subscription-tab";
import { BackupsTab } from "@/components/tenant/backups-tab";
import { MaintenanceIndicator } from "@/components/tenant/maintenance-indicator";
import { OperationLogTable } from "@/components/operation-log-table";
import { SuspendButton } from "./suspend-button";

export const dynamic = "force-dynamic";

type PageProps = {
  params: Promise<{ id: string }>;
  searchParams: Promise<{ tab?: string }>;
};

const VALID_TABS = new Set([
  "modules",
  "actions",
  "logs",
  "info",
  "backups",
  "branding",
  "subscription",
  "tickets",
  "operations",
]);

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

export default async function TenantDetailPage({
  params,
  searchParams,
}: PageProps) {
  const { id } = await params;
  const { tab } = await searchParams;
  const tenant = await getTenant(id);
  if (!tenant) notFound();

  const initialTab = tab && VALID_TABS.has(tab) ? tab : "modules";

  return (
    <>
      <PageHeader
        title={tenant.name}
        description={
          <span className="flex items-center gap-3">
            <span className="font-mono text-xs">{tenant.slug}</span>
            <TenantStatusBadge status={tenant.status} />
            <HealthIndicator tenantId={tenant.id} />
            <MaintenanceIndicator tenantId={tenant.id} />
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

      <TenantTabsRouter defaultValue={initialTab}>
        <TabsList>
          <TabsTrigger value="modules">Módulos</TabsTrigger>
          <TabsTrigger value="actions" className="gap-1.5">
            <Wrench className="size-3.5" />
            Acciones
          </TabsTrigger>
          <TabsTrigger value="logs" className="gap-1.5">
            <ScrollText className="size-3.5" />
            Logs
          </TabsTrigger>
          <TabsTrigger value="info">Info</TabsTrigger>
          <TabsTrigger value="backups">Backups</TabsTrigger>
          <TabsTrigger value="branding" className="gap-1.5">
            <Palette className="size-3.5" />
            Branding
          </TabsTrigger>
          <TabsTrigger value="subscription" className="gap-1.5">
            <Tag className="size-3.5" />
            Suscripción
          </TabsTrigger>
          <TicketsTabTrigger tenantId={tenant.id} />
          <TabsTrigger value="operations">Operaciones</TabsTrigger>
        </TabsList>

        <TabsContent value="modules">
          <ModulesTab tenantId={tenant.id} />
        </TabsContent>
        <TabsContent value="actions">
          <ActionsTab tenantId={tenant.id} />
        </TabsContent>
        <TabsContent value="logs">
          <LogsTab tenantId={tenant.id} />
        </TabsContent>
        <TabsContent value="info">
          <Placeholder
            title="Información del sistema"
            description="Datos de versión, base de datos y entorno. Próximamente."
          />
        </TabsContent>
        <TabsContent value="backups">
          <BackupsTab tenantId={tenant.id} />
        </TabsContent>
        <TabsContent value="branding">
          <BrandingTab tenantId={tenant.id} />
        </TabsContent>
        <TabsContent value="tickets">
          <TicketsTab tenantId={tenant.id} tenantName={tenant.name} />
        </TabsContent>
        <TabsContent value="subscription">
          <SubscriptionTab tenantId={tenant.id} />
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
      </TenantTabsRouter>
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
