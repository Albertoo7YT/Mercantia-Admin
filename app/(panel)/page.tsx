import Link from "next/link";
import { AlertTriangle } from "lucide-react";
import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { PageHeader } from "@/components/page-header";
import { OperationLogTable } from "@/components/operation-log-table";
import { prisma } from "@/lib/db";
import { loadAllSubscriptions } from "@/lib/subscriptions-aggregator";

export const dynamic = "force-dynamic";

async function getMetrics() {
  const yesterday = new Date(Date.now() - 24 * 60 * 60 * 1000);

  const [activeTenants, problemTenants, recentBackups, recentOps, latestLogs] =
    await Promise.all([
      prisma.tenant.count({ where: { status: "active" } }),
      prisma.tenant.count({ where: { status: { not: "active" } } }),
      prisma.backupSync.count({
        where: { createdAt: { gte: yesterday }, status: "completed" },
      }),
      prisma.operationLog.count({ where: { createdAt: { gte: yesterday } } }),
      prisma.operationLog.findMany({
        orderBy: { createdAt: "desc" },
        take: 10,
        include: { tenant: { select: { name: true, slug: true } } },
      }),
    ]);

  return {
    activeTenants,
    problemTenants,
    recentBackups,
    recentOps,
    latestLogs,
  };
}

export default async function DashboardPage() {
  const [m, subscriptions] = await Promise.all([
    getMetrics(),
    loadAllSubscriptions().catch(() => []),
  ]);

  const nearLimit = subscriptions
    .filter((row) => row.online && row.highestUsagePct >= 80)
    .sort((a, b) => b.highestUsagePct - a.highestUsagePct)
    .slice(0, 5);

  return (
    <>
      <PageHeader
        title="Dashboard"
        description="Estado general del parque de clientes Mercantia."
      />
      <div className="grid grid-cols-1 gap-4 sm:grid-cols-2 lg:grid-cols-4">
        <Metric
          title="Clientes activos"
          value={m.activeTenants}
          description="status = active"
          href="/tenants"
        />
        <Metric
          title="Con problemas"
          value={m.problemTenants}
          description="suspendidos / trial"
          href="/tenants"
          tone={m.problemTenants > 0 ? "warn" : "ok"}
        />
        <Metric
          title="Backups (24h)"
          value={m.recentBackups}
          description="completados con éxito"
        />
        <Metric
          title="Operaciones (24h)"
          value={m.recentOps}
          description="logs en el panel"
          href="/logs"
        />
      </div>

      {nearLimit.length > 0 ? (
        <section className="mt-8">
          <Card className="border-amber-300/60 bg-amber-50/30 dark:bg-amber-950/10">
            <CardHeader className="pb-2">
              <CardTitle className="flex items-center gap-2 text-sm font-medium text-amber-900 dark:text-amber-200">
                <AlertTriangle className="size-4" />
                Clientes cerca del límite
              </CardTitle>
            </CardHeader>
            <CardContent className="space-y-1.5">
              {nearLimit.map((row) => {
                const u = row.clientPlan?.usage;
                if (!u) return null;
                const items: Array<{
                  label: string;
                  used: number;
                  limit: number;
                  pct: number;
                }> = [];
                const push = (label: string, used: number, limit: number) => {
                  if (limit > 0 && used / limit >= 0.8) {
                    items.push({
                      label,
                      used,
                      limit,
                      pct: Math.round((used / limit) * 100),
                    });
                  }
                };
                push("Sales", u.sales, row.effective.maxSales);
                push("Office", u.office, row.effective.maxOffice);
                push("Admins", u.admins, row.effective.maxAdmins);
                if (items.length === 0) return null;
                const top = items.sort((a, b) => b.pct - a.pct)[0];
                return (
                  <Link
                    key={row.tenantId}
                    href={`/tenants/${row.tenantId}?tab=subscription`}
                    className="flex items-center justify-between gap-3 rounded-md px-2 py-1.5 text-sm hover:bg-amber-100/50 dark:hover:bg-amber-900/20"
                  >
                    <span className="font-medium">{row.tenantName}</span>
                    <span className="text-xs text-muted-foreground">
                      {top.pct}% {top.label} ({top.used}/{top.limit})
                    </span>
                    {top.pct >= 100 ? (
                      <Badge variant="destructive">Sobre límite</Badge>
                    ) : (
                      <Badge variant="warning">Cerca</Badge>
                    )}
                  </Link>
                );
              })}
              <Link
                href="/subscriptions"
                className="mt-2 inline-block text-xs text-muted-foreground hover:underline"
              >
                → Ver todos
              </Link>
            </CardContent>
          </Card>
        </section>
      ) : null}

      <section className="mt-10 space-y-3">
        <div className="flex items-center justify-between">
          <h2 className="text-base font-medium">Últimas operaciones</h2>
          <Link
            href="/logs"
            className="text-sm text-muted-foreground hover:underline"
          >
            Ver todas →
          </Link>
        </div>
        <OperationLogTable
          logs={m.latestLogs.map((l) => ({
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
      </section>
    </>
  );
}

type MetricProps = {
  title: string;
  value: number;
  description?: string;
  href?: string;
  tone?: "ok" | "warn";
};

function Metric({ title, value, description, href, tone }: MetricProps) {
  const card = (
    <Card
      className={
        tone === "warn" && value > 0
          ? "border-amber-300/60 bg-amber-50/40 dark:bg-amber-950/10"
          : ""
      }
    >
      <CardHeader className="pb-2">
        <CardTitle className="text-sm font-medium text-muted-foreground">
          {title}
        </CardTitle>
      </CardHeader>
      <CardContent>
        <div className="text-3xl font-semibold tabular-nums">{value}</div>
        {description ? (
          <CardDescription className="mt-1">{description}</CardDescription>
        ) : null}
      </CardContent>
    </Card>
  );
  return href ? (
    <Link href={href} className="block focus:outline-none">
      {card}
    </Link>
  ) : (
    card
  );
}
