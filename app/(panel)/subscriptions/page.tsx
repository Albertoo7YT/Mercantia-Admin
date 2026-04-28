import Link from "next/link";
import { AlertTriangle } from "lucide-react";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";
import { Badge } from "@/components/ui/badge";
import { PageHeader } from "@/components/page-header";
import { UsageBar } from "@/components/plans/usage-bar";
import { loadAllSubscriptions } from "@/lib/subscriptions-aggregator";
import { formatDate, formatRelativeDate } from "@/lib/utils";
import { BulkSyncButton } from "./bulk-sync-button";

export const dynamic = "force-dynamic";

type SearchParams = {
  plan?: string;
  payment?: string;
  desynced?: string;
  overrides?: string;
  nearLimit?: string;
};

type PageProps = { searchParams: Promise<SearchParams> };

export default async function SubscriptionsPage({ searchParams }: PageProps) {
  const sp = await searchParams;

  const all = await loadAllSubscriptions();

  let rows = all;
  if (sp.plan) {
    rows = rows.filter((r) => r.effective.planSlug === sp.plan);
  }
  if (sp.payment) {
    rows = rows.filter((r) => r.paymentStatus === sp.payment);
  }
  if (sp.desynced === "1") {
    rows = rows.filter(
      (r) => r.online && r.desyncFields.filter((f) => f !== "unsynced").length > 0,
    );
  }
  if (sp.overrides === "1") {
    rows = rows.filter((r) => r.hasOverrides);
  }
  if (sp.nearLimit === "1") {
    rows = rows.filter((r) => r.online && r.highestUsagePct >= 80);
  }

  const desyncedRows = all.filter(
    (r) => r.online && r.desyncFields.filter((f) => f !== "unsynced").length > 0,
  );

  return (
    <>
      <PageHeader
        title="Suscripciones"
        description={`${all.length} cliente${all.length === 1 ? "" : "s"} con suscripción`}
        actions={
          desyncedRows.length > 0 ? (
            <BulkSyncButton tenantIds={desyncedRows.map((r) => r.tenantId)} />
          ) : undefined
        }
      />

      <FiltersBar current={sp} />

      <div className="overflow-hidden rounded-md border bg-card">
        <Table>
          <TableHeader>
            <TableRow>
              <TableHead>Cliente</TableHead>
              <TableHead>Plan</TableHead>
              <TableHead>Comerciales</TableHead>
              <TableHead>Oficina</TableHead>
              <TableHead>Admins</TableHead>
              <TableHead>Pago</TableHead>
              <TableHead>Próximo pago</TableHead>
              <TableHead>Sync</TableHead>
            </TableRow>
          </TableHeader>
          <TableBody>
            {rows.map((r) => {
              const u = r.clientPlan?.usage;
              return (
                <TableRow key={r.tenantId}>
                  <TableCell>
                    <div className="flex items-center gap-2">
                      <Link
                        href={`/tenants/${r.tenantId}?tab=subscription`}
                        className="font-medium hover:underline"
                      >
                        {r.tenantName}
                      </Link>
                      {!r.online ? (
                        <Badge variant="muted">offline</Badge>
                      ) : null}
                      {r.hasOverrides ? (
                        <Badge variant="warning">overrides</Badge>
                      ) : null}
                      {r.online &&
                      r.desyncFields.filter((f) => f !== "unsynced").length >
                        0 ? (
                        <Badge variant="destructive" className="gap-1">
                          <AlertTriangle className="size-3" />
                          desync
                        </Badge>
                      ) : null}
                    </div>
                    <div className="font-mono text-xs text-muted-foreground">
                      {r.tenantSlug}
                    </div>
                  </TableCell>
                  <TableCell>{r.effective.planName}</TableCell>
                  <TableCell className="min-w-[140px]">
                    <UsageBar
                      label=""
                      used={u?.sales ?? 0}
                      limit={r.effective.maxSales}
                    />
                  </TableCell>
                  <TableCell className="min-w-[140px]">
                    <UsageBar
                      label=""
                      used={u?.office ?? 0}
                      limit={r.effective.maxOffice}
                    />
                  </TableCell>
                  <TableCell className="min-w-[140px]">
                    <UsageBar
                      label=""
                      used={u?.admins ?? 0}
                      limit={r.effective.maxAdmins}
                    />
                  </TableCell>
                  <TableCell>
                    <PaymentBadge status={r.paymentStatus} />
                  </TableCell>
                  <TableCell
                    className="text-xs text-muted-foreground"
                    title={
                      r.nextPaymentDate ? formatDate(r.nextPaymentDate) : undefined
                    }
                  >
                    {r.nextPaymentDate
                      ? formatRelativeDate(r.nextPaymentDate)
                      : "—"}
                  </TableCell>
                  <TableCell>
                    <SyncBadge status={r.syncStatus} lastSyncedAt={r.lastSyncedAt} />
                  </TableCell>
                </TableRow>
              );
            })}
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

function FiltersBar({ current }: { current: SearchParams }) {
  function toggleHref(name: keyof SearchParams) {
    const sp = new URLSearchParams();
    for (const [k, v] of Object.entries(current)) {
      if (v && k !== name) sp.set(k, String(v));
    }
    if (current[name] !== "1") sp.set(name, "1");
    return `?${sp.toString()}`;
  }
  function planHref(slug: string) {
    const sp = new URLSearchParams();
    for (const [k, v] of Object.entries(current)) {
      if (v && k !== "plan") sp.set(k, String(v));
    }
    if (current.plan !== slug) sp.set("plan", slug);
    return `?${sp.toString()}`;
  }

  const chip = (active: boolean) =>
    `inline-flex items-center rounded-md border px-2 py-0.5 text-xs transition-colors ${
      active
        ? "bg-foreground/90 text-background border-transparent"
        : "border-border text-muted-foreground hover:text-foreground"
    }`;

  return (
    <div className="mb-4 flex flex-wrap gap-1.5">
      <Link className={chip(current.plan === "starter")} href={planHref("starter")}>
        Starter
      </Link>
      <Link className={chip(current.plan === "pro")} href={planHref("pro")}>
        Pro
      </Link>
      <Link className={chip(current.plan === "business")} href={planHref("business")}>
        Business
      </Link>
      <span className="mx-1 text-muted-foreground">|</span>
      <Link className={chip(current.overrides === "1")} href={toggleHref("overrides")}>
        Con overrides
      </Link>
      <Link className={chip(current.desynced === "1")} href={toggleHref("desynced")}>
        Desincronizados
      </Link>
      <Link className={chip(current.nearLimit === "1")} href={toggleHref("nearLimit")}>
        Cerca del límite
      </Link>
      {Object.keys(current).length > 0 ? (
        <Link className={chip(false)} href="/subscriptions">
          Limpiar
        </Link>
      ) : null}
    </div>
  );
}

function PaymentBadge({ status }: { status: string | null }) {
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
      ? "Activo"
      : status === "trial"
        ? "Trial"
        : status === "overdue"
          ? "Vencido"
          : status === "suspended"
            ? "Suspendido"
            : status;
  return <Badge variant={variant}>{label}</Badge>;
}

function SyncBadge({
  status,
  lastSyncedAt,
}: {
  status: string | null;
  lastSyncedAt: Date | null;
}) {
  if (status === "ok") {
    return (
      <div className="flex flex-col">
        <Badge variant="success" className="w-fit">
          OK
        </Badge>
        {lastSyncedAt ? (
          <span
            className="mt-0.5 text-xs text-muted-foreground"
            title={formatDate(lastSyncedAt)}
          >
            {formatRelativeDate(lastSyncedAt)}
          </span>
        ) : null}
      </div>
    );
  }
  if (status === "failed") {
    return <Badge variant="destructive">Fallo</Badge>;
  }
  return <Badge variant="muted">Pendiente</Badge>;
}
