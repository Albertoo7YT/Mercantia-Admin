import Link from "next/link";
import {
  AlertTriangle,
  ArrowUpRight,
  Building2,
  CalendarRange,
  Receipt,
  TrendingUp,
} from "lucide-react";
import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from "@/components/ui/card";
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
import { TenantStatusBadge } from "@/components/tenant-status-badge";
import { loadBillingSummary } from "@/lib/billing";
import { formatEur } from "@/lib/money";
import { formatDate, formatRelativeDate } from "@/lib/utils";

export const dynamic = "force-dynamic";
export const metadata = { title: "Facturación · Mercantia Admin" };

type SearchParams = {
  status?: string;
  paymentStatus?: string;
};

type PageProps = { searchParams: Promise<SearchParams> };

export default async function BillingPage({ searchParams }: PageProps) {
  const sp = await searchParams;
  const summary = await loadBillingSummary();
  const { totals } = summary;

  let rows = summary.rows;
  if (sp.status) {
    rows = rows.filter((r) => r.tenantStatus === sp.status);
  }
  if (sp.paymentStatus) {
    rows = rows.filter((r) => r.paymentStatus === sp.paymentStatus);
  }

  return (
    <>
      <PageHeader
        title="Facturación"
        description={`${totals.activeTenants} cliente${totals.activeTenants === 1 ? "" : "s"} activo${totals.activeTenants === 1 ? "" : "s"} · ${formatEur(totals.mrrCents)} MRR`}
      />

      <div className="grid grid-cols-1 gap-3 sm:grid-cols-2 lg:grid-cols-4">
        <Kpi
          title="Clientes activos"
          value={String(totals.activeTenants)}
          subtitle={`${totals.totalTenants} en total`}
          icon={Building2}
        />
        <Kpi
          title="MRR"
          value={formatEur(totals.mrrCents)}
          subtitle={`ARR ${formatEur(totals.arrCents)}`}
          icon={TrendingUp}
          tone="emerald"
        />
        <Kpi
          title="Cobrado este mes"
          value={formatEur(totals.paidThisMonthCents)}
          subtitle={`Año en curso: ${formatEur(totals.paidThisYearCents)}`}
          icon={Receipt}
        />
        <Kpi
          title="Instalaciones pendientes"
          value={formatEur(totals.pendingInstallationCents)}
          subtitle={
            totals.overdueCount > 0
              ? `${totals.overdueCount} clientes con pago vencido`
              : "Sin pagos vencidos"
          }
          icon={AlertTriangle}
          tone={
            totals.pendingInstallationCents > 0 || totals.overdueCount > 0
              ? "amber"
              : "neutral"
          }
        />
      </div>

      <FiltersBar current={sp} />

      <div className="overflow-hidden rounded-md border bg-card">
        <Table>
          <TableHeader>
            <TableRow>
              <TableHead>Cliente</TableHead>
              <TableHead>Plan</TableHead>
              <TableHead>Mensual</TableHead>
              <TableHead>Anual</TableHead>
              <TableHead>Instalación</TableHead>
              <TableHead>Estado pago</TableHead>
              <TableHead>Próximo pago</TableHead>
              <TableHead>Cobrado mes</TableHead>
              <TableHead>Cobrado año</TableHead>
              <TableHead className="text-right" />
            </TableRow>
          </TableHeader>
          <TableBody>
            {rows.map((r) => (
              <TableRow key={r.tenantId}>
                <TableCell>
                  <div className="flex items-center gap-2">
                    <Link
                      href={`/tenants/${r.tenantId}?tab=subscription`}
                      className="font-medium hover:underline"
                    >
                      {r.tenantName}
                    </Link>
                    <TenantStatusBadge status={r.tenantStatus} />
                  </div>
                  <div className="font-mono text-xs text-muted-foreground">
                    {r.tenantSlug}
                  </div>
                </TableCell>
                <TableCell>
                  <div className="text-sm">{r.planName ?? "—"}</div>
                  {r.billingCycle ? (
                    <Badge variant="muted" className="mt-0.5 text-[10px]">
                      <CalendarRange className="mr-1 size-3" />
                      {r.billingCycle === "yearly" ? "Anual" : "Mensual"}
                    </Badge>
                  ) : null}
                </TableCell>
                <TableCell className="tabular-nums">
                  {formatEur(r.monthlyCents)}
                </TableCell>
                <TableCell className="tabular-nums text-muted-foreground">
                  {formatEur(r.yearlyCents)}
                </TableCell>
                <TableCell>
                  <div className="flex flex-col gap-0.5">
                    <span className="tabular-nums">
                      {formatEur(r.installationCents)}
                    </span>
                    {r.installationCents > 0 ? (
                      r.installationPaidAt ? (
                        <Badge variant="success" className="w-fit text-[10px]">
                          Pagada
                        </Badge>
                      ) : (
                        <Badge
                          variant="warning"
                          className="w-fit text-[10px]"
                        >
                          Pendiente
                        </Badge>
                      )
                    ) : null}
                  </div>
                </TableCell>
                <TableCell>
                  <PaymentStatusBadge status={r.paymentStatus} />
                </TableCell>
                <TableCell
                  className="text-xs text-muted-foreground"
                  title={
                    r.nextPaymentDate ? formatDate(r.nextPaymentDate) : ""
                  }
                >
                  {r.nextPaymentDate
                    ? formatRelativeDate(r.nextPaymentDate)
                    : "—"}
                </TableCell>
                <TableCell className="tabular-nums">
                  {formatEur(r.paidThisMonthCents)}
                </TableCell>
                <TableCell className="tabular-nums">
                  {formatEur(r.paidThisYearCents)}
                </TableCell>
                <TableCell className="text-right">
                  <Link
                    href={`/tenants/${r.tenantId}?tab=subscription`}
                    className="inline-flex items-center gap-1 text-xs text-muted-foreground hover:underline"
                  >
                    Detalle
                    <ArrowUpRight className="size-3.5" />
                  </Link>
                </TableCell>
              </TableRow>
            ))}
          </TableBody>
        </Table>
      </div>

      {rows.length === 0 ? (
        <p className="mt-6 text-center text-sm text-muted-foreground">
          Ningún cliente coincide con los filtros.
        </p>
      ) : null}
    </>
  );
}

function Kpi({
  title,
  value,
  subtitle,
  icon: Icon,
  tone = "neutral",
}: {
  title: string;
  value: string;
  subtitle?: string;
  icon: React.ComponentType<{ className?: string }>;
  tone?: "neutral" | "emerald" | "amber";
}) {
  const ringByTone: Record<string, string> = {
    neutral: "",
    emerald: "border-emerald-300/60 bg-emerald-50/40 dark:bg-emerald-950/10",
    amber: "border-amber-300/60 bg-amber-50/40 dark:bg-amber-950/10",
  };
  return (
    <Card className={ringByTone[tone]}>
      <CardHeader className="pb-2">
        <CardTitle className="flex items-center justify-between text-sm font-medium text-muted-foreground">
          {title}
          <Icon className="size-4 text-muted-foreground" />
        </CardTitle>
      </CardHeader>
      <CardContent>
        <div className="text-2xl font-semibold tabular-nums sm:text-3xl">
          {value}
        </div>
        {subtitle ? (
          <CardDescription className="mt-1">{subtitle}</CardDescription>
        ) : null}
      </CardContent>
    </Card>
  );
}

function PaymentStatusBadge({ status }: { status: string | null }) {
  if (!status) return <span className="text-muted-foreground">—</span>;
  const variant: "success" | "warning" | "destructive" | "muted" =
    status === "active"
      ? "success"
      : status === "trial"
        ? "warning"
        : status === "overdue"
          ? "destructive"
          : "muted";
  const label =
    status === "active"
      ? "Al día"
      : status === "trial"
        ? "Trial"
        : status === "overdue"
          ? "Vencido"
          : status === "suspended"
            ? "Suspendido"
            : status;
  return <Badge variant={variant}>{label}</Badge>;
}

function FiltersBar({ current }: { current: SearchParams }) {
  const chip = (active: boolean) =>
    `inline-flex items-center rounded-md border px-2 py-0.5 text-xs transition-colors ${
      active
        ? "bg-foreground/90 text-background border-transparent"
        : "border-border text-muted-foreground hover:text-foreground"
    }`;

  function buildHref(name: keyof SearchParams, value: string) {
    const sp = new URLSearchParams();
    for (const [k, v] of Object.entries(current)) {
      if (v && k !== name) sp.set(k, String(v));
    }
    if (current[name] !== value) sp.set(name, value);
    return `?${sp.toString()}`;
  }

  return (
    <div className="my-4 flex flex-wrap items-center gap-1.5">
      <span className="text-xs text-muted-foreground">Estado cliente:</span>
      <Link className={chip(current.status === "active")} href={buildHref("status", "active")}>
        Activos
      </Link>
      <Link className={chip(current.status === "trial")} href={buildHref("status", "trial")}>
        Trial
      </Link>
      <Link className={chip(current.status === "suspended")} href={buildHref("status", "suspended")}>
        Suspendidos
      </Link>
      <span className="mx-2 text-muted-foreground">|</span>
      <span className="text-xs text-muted-foreground">Pago:</span>
      <Link className={chip(current.paymentStatus === "active")} href={buildHref("paymentStatus", "active")}>
        Al día
      </Link>
      <Link className={chip(current.paymentStatus === "overdue")} href={buildHref("paymentStatus", "overdue")}>
        Vencido
      </Link>
      <Link className={chip(current.paymentStatus === "trial")} href={buildHref("paymentStatus", "trial")}>
        Trial
      </Link>
      {(current.status || current.paymentStatus) ? (
        <Link className={chip(false)} href="/billing">
          Limpiar
        </Link>
      ) : null}
    </div>
  );
}
