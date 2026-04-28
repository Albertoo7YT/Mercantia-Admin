import type { Prisma } from "@prisma/client";
import { prisma } from "@/lib/db";
import { decrypt } from "@/lib/crypto";
import {
  annotateDependents,
  type ModuleAuditEvent,
  type ModuleInfo,
} from "@/lib/types/tenant-modules";
import {
  isTerminalStatus,
  type ActionLogChunk,
  type ActionType,
  type AdminAction,
  type MaintenanceStatus,
} from "@/lib/types/tenant-actions";
import type {
  BrandingAuditEvent,
  BrandingField,
  TenantBrandingPayload,
} from "@/lib/types/tenant-branding";
import type {
  TicketCategory,
  TicketPriority,
  TicketStatus,
} from "@/lib/tickets-constants";

const DEFAULT_TIMEOUT_MS = 5000;

// ----------------------------------------------------------------------------
// Low-level helpers
// ----------------------------------------------------------------------------

export class TenantApiError extends Error {
  status: number;
  body: unknown;
  constructor(message: string, status: number, body: unknown) {
    super(message);
    this.name = "TenantApiError";
    this.status = status;
    this.body = body;
  }
}

export type TenantApiResult<T> =
  | { ok: true; status: number; data: T }
  | { ok: false; status: number; error: string; body?: unknown };

type CallOptions = {
  method?: "GET" | "POST" | "PUT" | "DELETE" | "PATCH";
  body?: unknown;
  timeoutMs?: number;
  query?: Record<string, string | number | boolean | undefined>;
  signal?: AbortSignal;
  /** When false, do not attach Authorization header (used for public health endpoint). */
  authenticated?: boolean;
};

async function loadTenantOrThrow(tenantId: string) {
  const tenant = await prisma.tenant.findUnique({ where: { id: tenantId } });
  if (!tenant) throw new TenantApiError("Tenant not found", 404, null);
  let token: string;
  try {
    token = decrypt(tenant.apiToken);
  } catch {
    throw new TenantApiError(
      "Tenant API token is corrupt or could not be decrypted",
      500,
      null,
    );
  }
  return { tenant, token };
}

function buildUrl(base: string, path: string, query?: CallOptions["query"]) {
  const u = new URL(path.replace(/^\//, ""), base.endsWith("/") ? base : base + "/");
  if (query) {
    for (const [k, v] of Object.entries(query)) {
      if (v === undefined) continue;
      u.searchParams.set(k, String(v));
    }
  }
  return u.toString();
}

async function logFailure(
  tenantId: string,
  action: string,
  status: number,
  message: string,
) {
  try {
    await prisma.operationLog.create({
      data: {
        tenantId,
        action,
        status: "error",
        errorMessage: `${status}: ${message}`.slice(0, 1000),
      },
    });
  } catch {
    // swallow logging errors so they don't mask the original failure
  }
}

export async function makeTenantApiCall<T = unknown>(
  tenantId: string,
  path: string,
  options: CallOptions = {},
  meta: { action?: string; logFailures?: boolean } = {},
): Promise<TenantApiResult<T>> {
  const action = meta.action ?? `tenant.api.${path}`;
  const shouldLog = meta.logFailures !== false;
  let tenantData: Awaited<ReturnType<typeof loadTenantOrThrow>>;
  try {
    tenantData = await loadTenantOrThrow(tenantId);
  } catch (e) {
    const err = e as TenantApiError;
    if (shouldLog) await logFailure(tenantId, action, err.status, err.message);
    return { ok: false, status: err.status, error: err.message };
  }

  const { tenant, token } = tenantData;
  const url = buildUrl(tenant.apiUrl, path, options.query);
  const timeoutMs = options.timeoutMs ?? DEFAULT_TIMEOUT_MS;
  const ac = new AbortController();
  const timer = setTimeout(() => ac.abort(), timeoutMs);

  const headers: Record<string, string> = {
    Accept: "application/json",
  };
  if (options.authenticated !== false) {
    headers.Authorization = `Bearer ${token}`;
  }
  if (options.body !== undefined) {
    headers["Content-Type"] = "application/json";
  }

  try {
    const res = await fetch(url, {
      method: options.method ?? "GET",
      headers,
      body: options.body !== undefined ? JSON.stringify(options.body) : undefined,
      signal: options.signal ?? ac.signal,
      cache: "no-store",
    });

    clearTimeout(timer);

    const ct = res.headers.get("content-type") ?? "";
    let body: unknown = null;
    if (ct.includes("application/json")) {
      body = await res.json().catch(() => null);
    } else {
      body = await res.text().catch(() => null);
    }

    if (!res.ok) {
      const message =
        (typeof body === "object" && body && "error" in body
          ? String((body as { error: unknown }).error)
          : null) ?? `HTTP ${res.status}`;
      if (shouldLog) await logFailure(tenantId, action, res.status, message);
      return { ok: false, status: res.status, error: message, body };
    }

    return { ok: true, status: res.status, data: body as T };
  } catch (err) {
    clearTimeout(timer);
    const aborted = (err as Error)?.name === "AbortError";
    const message = aborted
      ? `Timeout after ${timeoutMs}ms`
      : (err as Error)?.message ?? "Network error";
    if (shouldLog) await logFailure(tenantId, action, 0, message);
    return { ok: false, status: 0, error: message };
  }
}

// ----------------------------------------------------------------------------
// Public, high-level API used by route handlers
// ----------------------------------------------------------------------------

// --- HEALTH (no auth, polled) ----------------------------------------------

export type TenantHealthSuccess = {
  ok: true;
  status: string;
  version: string;
  timestamp: string;
  responseMs: number;
};
export type TenantHealthFailure = {
  ok: false;
  error: string;
  responseMs: number;
};
export type TenantHealthResult = TenantHealthSuccess | TenantHealthFailure;

export async function fetchTenantHealth(
  tenantId: string,
): Promise<TenantHealthResult> {
  const start = Date.now();
  let tenant;
  try {
    tenant = await prisma.tenant.findUnique({ where: { id: tenantId } });
  } catch (e) {
    return {
      ok: false,
      error: (e as Error).message,
      responseMs: Date.now() - start,
    };
  }
  if (!tenant) {
    return { ok: false, error: "Tenant not found", responseMs: 0 };
  }

  const url = buildUrl(tenant.apiUrl, "/api/admin/system/health");
  const ac = new AbortController();
  const timer = setTimeout(() => ac.abort(), DEFAULT_TIMEOUT_MS);
  try {
    const res = await fetch(url, {
      method: "GET",
      headers: { Accept: "application/json" },
      signal: ac.signal,
      cache: "no-store",
    });
    clearTimeout(timer);
    const responseMs = Date.now() - start;

    if (!res.ok) {
      return { ok: false, error: `HTTP ${res.status}`, responseMs };
    }
    const body = (await res.json().catch(() => null)) as {
      status?: string;
      version?: string;
      timestamp?: string;
    } | null;
    return {
      ok: true,
      status: body?.status ?? "unknown",
      version: body?.version ?? "",
      timestamp: body?.timestamp ?? new Date().toISOString(),
      responseMs,
    };
  } catch (err) {
    clearTimeout(timer);
    const responseMs = Date.now() - start;
    const aborted = (err as Error)?.name === "AbortError";
    return {
      ok: false,
      error: aborted ? `Timeout after ${DEFAULT_TIMEOUT_MS}ms` : (err as Error).message,
      responseMs,
    };
  }
}

// --- MODULES ---------------------------------------------------------------

type RawTenantModule = {
  name: string;
  label?: string;
  description?: string;
  category?: string;
  alwaysOn?: boolean;
  enabled?: boolean;
  dependsOn?: string[];
  enabledAt?: string;
  disabledAt?: string;
};

const VALID_CATEGORIES = new Set([
  "core",
  "sales",
  "inventory",
  "integrations",
  "analytics",
]);

function normalizeModule(raw: RawTenantModule): ModuleInfo {
  const category = VALID_CATEGORIES.has(raw.category ?? "")
    ? (raw.category as ModuleInfo["category"])
    : "core";
  return {
    name: raw.name,
    label: raw.label ?? raw.name,
    description: raw.description,
    category,
    alwaysOn: raw.alwaysOn ?? false,
    enabled: raw.enabled ?? false,
    dependsOn: raw.dependsOn ?? [],
    dependents: [],
    enabledAt: raw.enabledAt,
    disabledAt: raw.disabledAt,
  };
}

export async function fetchTenantModules(
  tenantId: string,
): Promise<{ ok: true; modules: ModuleInfo[] } | { ok: false; error: string }> {
  const result = await makeTenantApiCall<
    { modules?: RawTenantModule[] } | RawTenantModule[]
  >(
    tenantId,
    "/api/admin/system/modules",
    {},
    { action: "tenant.modules.list", logFailures: false },
  );

  if (!result.ok) {
    return { ok: false, error: result.error };
  }

  const data = result.data;
  const raw: RawTenantModule[] = Array.isArray(data)
    ? data
    : Array.isArray(data?.modules)
      ? data!.modules!
      : [];

  const modules = annotateDependents(raw.map(normalizeModule));
  return { ok: true, modules };
}

// --- TOGGLE MODULE (writes OperationLog: pending → success | error) --------

export type ToggleModuleParams = {
  module: string;
  enabled: boolean;
  reason?: string;
};

export type ToggleModuleResult =
  | { ok: true }
  | { ok: false; error: string; code?: "DEPENDENCY_BLOCK" | string };

const DEPENDENCY_HINT = /depend|dependenc|dependency|prerequisite/i;

export async function toggleTenantModule(
  tenantId: string,
  params: ToggleModuleParams,
): Promise<ToggleModuleResult> {
  const tenant = await prisma.tenant.findUnique({ where: { id: tenantId } });
  if (!tenant) {
    return { ok: false, error: "Tenant not found" };
  }

  const log = await prisma.operationLog.create({
    data: {
      tenantId,
      action: "module_toggle",
      status: "pending",
      details: {
        module: params.module,
        enabled: params.enabled,
        reason: params.reason ?? null,
        tenantSlug: tenant.slug,
        tenantApiUrl: tenant.apiUrl,
      },
    },
  });

  const result = await makeTenantApiCall<{ ok?: boolean }>(
    tenantId,
    "/api/admin/system/modules/toggle",
    {
      method: "POST",
      body: {
        module: params.module,
        enabled: params.enabled,
        reason: params.reason,
      },
    },
    { action: "module_toggle", logFailures: false },
  );

  if (result.ok) {
    await prisma.operationLog.update({
      where: { id: log.id },
      data: { status: "success" },
    });
    return { ok: true };
  }

  const isDependency =
    result.status === 400 &&
    (DEPENDENCY_HINT.test(result.error) ||
      (typeof result.body === "object" &&
        result.body &&
        "code" in result.body &&
        String((result.body as { code: unknown }).code).toUpperCase() ===
          "DEPENDENCY_BLOCK"));

  await prisma.operationLog.update({
    where: { id: log.id },
    data: {
      status: "error",
      errorMessage: `${result.status}: ${result.error}`.slice(0, 1000),
    },
  });

  return {
    ok: false,
    error: result.error,
    code: isDependency ? "DEPENDENCY_BLOCK" : undefined,
  };
}

// --- MODULE AUDIT ---------------------------------------------------------

type RawAuditEvent = {
  id?: number | string;
  module?: string;
  action?: string;
  performedBy?: string | null;
  reason?: string | null;
  createdAt?: string;
};

const VALID_AUDIT_ACTIONS = new Set(["enabled", "disabled", "config_changed"]);

export async function fetchTenantModulesAudit(
  tenantId: string,
  limit = 50,
): Promise<
  | { ok: true; events: ModuleAuditEvent[] }
  | { ok: false; error: string }
> {
  const result = await makeTenantApiCall<
    { events?: RawAuditEvent[] } | RawAuditEvent[]
  >(
    tenantId,
    "/api/admin/system/modules/audit",
    { query: { limit } },
    { action: "tenant.modules.audit", logFailures: false },
  );

  if (!result.ok) {
    return { ok: false, error: result.error };
  }

  const data = result.data;
  const raw: RawAuditEvent[] = Array.isArray(data)
    ? data
    : Array.isArray(data?.events)
      ? data!.events!
      : [];

  const events: ModuleAuditEvent[] = raw
    .filter((e) => e.id !== undefined && e.module && e.action)
    .map((e) => ({
      id: e.id!,
      module: e.module!,
      action: VALID_AUDIT_ACTIONS.has(e.action ?? "")
        ? (e.action as ModuleAuditEvent["action"])
        : "config_changed",
      performedBy: e.performedBy ?? null,
      reason: e.reason ?? null,
      createdAt: e.createdAt ?? new Date().toISOString(),
    }))
    .slice(0, limit);

  return { ok: true, events };
}

// --- LOGS ------------------------------------------------------------------

export type TenantLogLevel = "error" | "warn" | "info" | "debug" | "raw";
export type TenantLogSource = "stdout" | "stderr" | "combined";

export interface TenantLogEntry {
  timestamp: string;
  level: TenantLogLevel;
  source: TenantLogSource;
  message: string;
  raw: string;
  parsed?: Record<string, unknown>;
}

export interface TenantLogsMetadata {
  pm2AppName: string;
  totalLinesRead: number;
  fileExisted: { stdout: boolean; stderr: boolean };
  fileSizes: { stdout: number; stderr: number };
}

export interface TenantLogsResponse {
  entries: TenantLogEntry[];
  metadata: TenantLogsMetadata;
}

export type FetchTenantLogsOptions = {
  maxLines?: number;
  source?: TenantLogSource;
  level?: string[];
  since?: string;
  search?: string;
};

export function buildTenantLogsQuery(opts: FetchTenantLogsOptions = {}) {
  const q: Record<string, string | number | boolean | undefined> = {};
  if (opts.maxLines !== undefined) q.maxLines = opts.maxLines;
  if (opts.source) q.source = opts.source;
  if (opts.since) q.since = opts.since;
  if (opts.search) q.search = opts.search;
  if (opts.level && opts.level.length > 0) q.level = opts.level.join(",");
  return q;
}

export async function fetchTenantLogs(
  tenantId: string,
  opts: FetchTenantLogsOptions = {},
): Promise<
  { ok: true; data: TenantLogsResponse } | { ok: false; error: string }
> {
  const result = await makeTenantApiCall<TenantLogsResponse>(
    tenantId,
    "/api/admin/system/logs",
    { query: buildTenantLogsQuery(opts), timeoutMs: 10_000 },
    { action: "tenant.logs.fetch", logFailures: false },
  );
  if (!result.ok) return { ok: false, error: result.error };
  return { ok: true, data: result.data };
}

// --- ACTIONS ---------------------------------------------------------------
//
// `triggerTenantAction` creates an OperationLog with status='pending' BEFORE
// the call to the tenant. Once the tenant returns the actionId we patch the
// log so future polls can find it. `getTenantActionStatus` reconciles the
// pending log to success/error when the tenant reports a terminal state.

const ACTION_LOG_PREFIX = "tenant_action_";

type DetailsObject = Record<string, unknown>;

function readLogDetails(details: unknown): DetailsObject {
  if (details && typeof details === "object" && !Array.isArray(details)) {
    return { ...(details as DetailsObject) };
  }
  return {};
}

export async function triggerTenantAction(
  tenantId: string,
  type: ActionType,
  metadata?: Record<string, unknown> | null,
): Promise<
  | { ok: true; action: AdminAction; operationLogId: string }
  | { ok: false; error: string }
> {
  const tenant = await prisma.tenant.findUnique({ where: { id: tenantId } });
  if (!tenant) {
    return { ok: false, error: "Tenant not found" };
  }

  const log = await prisma.operationLog.create({
    data: {
      tenantId,
      action: `${ACTION_LOG_PREFIX}${type}`,
      status: "pending",
      details: {
        type,
        metadata: (metadata ?? null) as Prisma.InputJsonValue,
        actionId: null,
        tenantSlug: tenant.slug,
        tenantApiUrl: tenant.apiUrl,
      } as Prisma.InputJsonValue,
    },
  });

  const result = await makeTenantApiCall<AdminAction>(
    tenantId,
    "/api/admin/system/actions",
    { method: "POST", body: { type, metadata: metadata ?? undefined } },
    { action: `${ACTION_LOG_PREFIX}${type}`, logFailures: false },
  );

  if (!result.ok) {
    await prisma.operationLog.update({
      where: { id: log.id },
      data: {
        status: "error",
        errorMessage: `${result.status}: ${result.error}`.slice(0, 1000),
      },
    });
    return { ok: false, error: result.error };
  }

  const action = result.data;
  await prisma.operationLog.update({
    where: { id: log.id },
    data: {
      details: {
        type,
        metadata: (metadata ?? null) as Prisma.InputJsonValue,
        actionId: action.id,
        tenantSlug: tenant.slug,
        tenantApiUrl: tenant.apiUrl,
        startedAt: action.startedAt ?? null,
      } as Prisma.InputJsonValue,
    },
  });

  return { ok: true, action, operationLogId: log.id };
}

async function reconcileLogForAction(
  tenantId: string,
  action: AdminAction,
): Promise<void> {
  if (!isTerminalStatus(action.status)) return;
  const log = await prisma.operationLog.findFirst({
    where: {
      tenantId,
      status: "pending",
      details: { path: ["actionId"], equals: action.id },
    },
  });
  if (!log) return;

  const merged = readLogDetails(log.details);
  merged.exitCode = action.exitCode ?? null;
  merged.durationMs = action.durationMs ?? null;
  merged.completedAt = action.completedAt ?? new Date().toISOString();

  await prisma.operationLog.update({
    where: { id: log.id },
    data: {
      status: action.status === "completed" ? "success" : "error",
      errorMessage:
        action.status === "failed"
          ? (action.errorMessage ?? "Action failed").slice(0, 1000)
          : null,
      details: merged as unknown as object,
    },
  });
}

export async function getTenantActionStatus(
  tenantId: string,
  actionId: string,
): Promise<
  { ok: true; action: AdminAction } | { ok: false; error: string }
> {
  const result = await makeTenantApiCall<AdminAction>(
    tenantId,
    `/api/admin/system/actions/${encodeURIComponent(actionId)}`,
    { timeoutMs: 8_000 },
    { action: "tenant.action.status", logFailures: false },
  );
  if (!result.ok) return { ok: false, error: result.error };
  await reconcileLogForAction(tenantId, result.data).catch(() => {
    // best effort: never let reconciliation errors mask the status response
  });
  return { ok: true, action: result.data };
}

export async function getTenantActionLogs(
  tenantId: string,
  actionId: string,
  opts: { fromLine?: number; maxLines?: number } = {},
): Promise<
  { ok: true; data: ActionLogChunk } | { ok: false; error: string }
> {
  const query: Record<string, string | number | undefined> = {};
  if (opts.fromLine !== undefined) query.fromLine = opts.fromLine;
  if (opts.maxLines !== undefined) query.maxLines = opts.maxLines;
  const result = await makeTenantApiCall<ActionLogChunk>(
    tenantId,
    `/api/admin/system/actions/${encodeURIComponent(actionId)}/logs`,
    { query, timeoutMs: 10_000 },
    { action: "tenant.action.logs", logFailures: false },
  );
  if (!result.ok) return { ok: false, error: result.error };
  return { ok: true, data: result.data };
}

export async function listTenantActions(
  tenantId: string,
  opts: { limit?: number; status?: string; type?: string } = {},
): Promise<
  | { ok: true; actions: AdminAction[] }
  | { ok: false; error: string }
> {
  const query: Record<string, string | number | undefined> = {};
  if (opts.limit !== undefined) query.limit = opts.limit;
  if (opts.status) query.status = opts.status;
  if (opts.type) query.type = opts.type;
  const result = await makeTenantApiCall<
    { actions?: AdminAction[] } | AdminAction[]
  >(
    tenantId,
    "/api/admin/system/actions",
    { query },
    { action: "tenant.action.list", logFailures: false },
  );
  if (!result.ok) return { ok: false, error: result.error };
  const data = result.data;
  const actions = Array.isArray(data)
    ? data
    : Array.isArray(data?.actions)
      ? data!.actions!
      : [];
  return { ok: true, actions };
}

export async function getTenantMaintenance(
  tenantId: string,
): Promise<
  { ok: true; data: MaintenanceStatus } | { ok: false; error: string }
> {
  const result = await makeTenantApiCall<MaintenanceStatus>(
    tenantId,
    "/api/admin/system/maintenance",
    {},
    { action: "tenant.maintenance.status", logFailures: false },
  );
  if (!result.ok) return { ok: false, error: result.error };
  return { ok: true, data: result.data };
}

// --- BRANDING --------------------------------------------------------------

export async function fetchTenantBranding(
  tenantId: string,
): Promise<
  | { ok: true; data: TenantBrandingPayload }
  | { ok: false; error: string }
> {
  const result = await makeTenantApiCall<TenantBrandingPayload>(
    tenantId,
    "/api/admin/system/branding",
    {},
    { action: "tenant.branding.get", logFailures: false },
  );
  if (!result.ok) return { ok: false, error: result.error };
  return { ok: true, data: result.data };
}

export async function updateTenantBranding(
  tenantId: string,
  payload: Partial<TenantBrandingPayload>,
): Promise<
  { ok: true; data: TenantBrandingPayload } | { ok: false; error: string }
> {
  const fieldsChanged = Object.keys(payload) as BrandingField[];

  const result = await makeTenantApiCall<TenantBrandingPayload>(
    tenantId,
    "/api/admin/system/branding",
    { method: "PUT", body: payload, timeoutMs: 8_000 },
    { action: "tenant_branding_update", logFailures: false },
  );

  if (!result.ok) {
    await prisma.operationLog
      .create({
        data: {
          tenantId,
          action: "tenant_branding_update",
          status: "error",
          errorMessage: `${result.status}: ${result.error}`.slice(0, 1000),
          details: {
            fieldsChanged,
          } as Prisma.InputJsonValue,
        },
      })
      .catch(() => null);
    return { ok: false, error: result.error };
  }

  await prisma.operationLog
    .create({
      data: {
        tenantId,
        action: "tenant_branding_update",
        status: "success",
        details: {
          fieldsChanged,
        } as Prisma.InputJsonValue,
      },
    })
    .catch(() => null);

  return { ok: true, data: result.data };
}

type RawBrandingAuditEvent = {
  id?: string | number;
  field?: string;
  oldValue?: unknown;
  newValue?: unknown;
  performedBy?: string | null;
  createdAt?: string;
};

export async function fetchTenantBrandingAudit(
  tenantId: string,
  limit = 50,
): Promise<
  { ok: true; events: BrandingAuditEvent[] } | { ok: false; error: string }
> {
  const result = await makeTenantApiCall<
    { events?: RawBrandingAuditEvent[] } | RawBrandingAuditEvent[]
  >(
    tenantId,
    "/api/admin/system/branding/audit",
    { query: { limit } },
    { action: "tenant.branding.audit", logFailures: false },
  );
  if (!result.ok) return { ok: false, error: result.error };
  const data = result.data;
  const raw: RawBrandingAuditEvent[] = Array.isArray(data)
    ? data
    : Array.isArray(data?.events)
      ? data!.events!
      : [];
  const events: BrandingAuditEvent[] = raw
    .filter((e) => e.id !== undefined && e.field)
    .map((e) => ({
      id: e.id!,
      field: e.field!,
      oldValue: e.oldValue ?? null,
      newValue: e.newValue ?? null,
      performedBy: e.performedBy ?? null,
      createdAt: e.createdAt ?? new Date().toISOString(),
    }))
    .slice(0, limit);
  return { ok: true, events };
}

export async function uploadTenantLogo(
  tenantId: string,
  file: File,
): Promise<{ ok: true; url: string } | { ok: false; error: string }> {
  const tenant = await prisma.tenant.findUnique({ where: { id: tenantId } });
  if (!tenant) {
    return { ok: false, error: "Tenant not found" };
  }
  let token: string;
  try {
    token = decrypt(tenant.apiToken);
  } catch {
    return { ok: false, error: "Tenant API token corrupt" };
  }

  const form = new FormData();
  form.append("file", file, file.name || "logo");

  const url = new URL(
    "/api/admin/system/branding/upload-logo".replace(/^\//, ""),
    tenant.apiUrl.endsWith("/") ? tenant.apiUrl : tenant.apiUrl + "/",
  ).toString();

  const ac = new AbortController();
  const timer = setTimeout(() => ac.abort(), 30_000);
  try {
    const res = await fetch(url, {
      method: "POST",
      headers: { Authorization: `Bearer ${token}`, Accept: "application/json" },
      body: form,
      signal: ac.signal,
      cache: "no-store",
    });
    clearTimeout(timer);
    const ct = res.headers.get("content-type") ?? "";
    let body: unknown = null;
    if (ct.includes("application/json")) {
      body = await res.json().catch(() => null);
    } else {
      body = await res.text().catch(() => null);
    }
    if (!res.ok) {
      const message =
        (typeof body === "object" && body && "error" in body
          ? String((body as { error: unknown }).error)
          : null) ?? `HTTP ${res.status}`;
      return { ok: false, error: message };
    }
    const responseUrl =
      typeof body === "object" && body && "url" in body
        ? String((body as { url: unknown }).url)
        : null;
    if (!responseUrl) {
      return { ok: false, error: "Tenant did not return a logo URL" };
    }
    return { ok: true, url: responseUrl };
  } catch (err) {
    clearTimeout(timer);
    const aborted = (err as Error)?.name === "AbortError";
    return {
      ok: false,
      error: aborted ? "Timeout subiendo el logo" : (err as Error).message,
    };
  }
}

// --- TICKETS ---------------------------------------------------------------

export interface TenantTicketSummary {
  id: string;
  number: number;
  subject: string;
  category: TicketCategory;
  priority: TicketPriority;
  status: TicketStatus;
  createdBy: { id: string; name: string; email: string };
  lastMessageAt: string;
  unreadByAdmin: boolean;
  messageCount: number;
  createdAt: string;
}

export interface TenantTicketAttachment {
  id: string;
  filename: string;
  sizeBytes: number;
  mimeType: string;
}

export interface TenantTicketMessage {
  id: string;
  senderType: "user" | "admin";
  senderName: string;
  senderUserId?: string;
  content: string;
  internalNote: boolean;
  attachments: TenantTicketAttachment[];
  createdAt: string;
}

export interface TenantTicketDetail {
  ticket: TenantTicketSummary & {
    metadata?: Record<string, unknown> | null;
    resolvedAt?: string | null;
    closedAt?: string | null;
    reopenableUntil?: string | null;
  };
  messages: TenantTicketMessage[];
}

export type FetchTenantTicketsFilters = {
  status?: TicketStatus[];
  category?: TicketCategory;
  priority?: TicketPriority;
  search?: string;
  unreadOnly?: boolean;
};

export function buildTicketsQuery(
  filters: FetchTenantTicketsFilters = {},
): Record<string, string | number | boolean | undefined> {
  const q: Record<string, string | number | boolean | undefined> = {};
  if (filters.status && filters.status.length > 0) {
    q.status = filters.status.join(",");
  }
  if (filters.category) q.category = filters.category;
  if (filters.priority) q.priority = filters.priority;
  if (filters.search) q.search = filters.search;
  if (filters.unreadOnly) q.unreadOnly = "1";
  return q;
}

export async function fetchTenantTickets(
  tenantId: string,
  filters: FetchTenantTicketsFilters = {},
): Promise<
  | { ok: true; tickets: TenantTicketSummary[] }
  | { ok: false; error: string }
> {
  const result = await makeTenantApiCall<
    { tickets?: TenantTicketSummary[] } | TenantTicketSummary[]
  >(
    tenantId,
    "/api/admin/system/tickets",
    { query: buildTicketsQuery(filters), timeoutMs: 8_000 },
    { action: "tenant.tickets.list", logFailures: false },
  );
  if (!result.ok) return { ok: false, error: result.error };
  const data = result.data;
  const tickets = Array.isArray(data)
    ? data
    : Array.isArray(data?.tickets)
      ? data!.tickets!
      : [];
  return { ok: true, tickets };
}

export async function fetchTenantTicketDetail(
  tenantId: string,
  ticketId: string,
): Promise<
  { ok: true; data: TenantTicketDetail } | { ok: false; error: string }
> {
  const result = await makeTenantApiCall<TenantTicketDetail>(
    tenantId,
    `/api/admin/system/tickets/${encodeURIComponent(ticketId)}`,
    { timeoutMs: 8_000 },
    { action: "tenant.tickets.detail", logFailures: false },
  );
  if (!result.ok) return { ok: false, error: result.error };
  return { ok: true, data: result.data };
}

export async function postTenantTicketMessage(
  tenantId: string,
  ticketId: string,
  opts: {
    content: string;
    internalNote?: boolean;
    attachments?: File[];
  },
): Promise<{ ok: true } | { ok: false; error: string }> {
  const tenant = await prisma.tenant.findUnique({ where: { id: tenantId } });
  if (!tenant) return { ok: false, error: "Tenant not found" };
  let token: string;
  try {
    token = decrypt(tenant.apiToken);
  } catch {
    return { ok: false, error: "Tenant API token corrupt" };
  }

  const form = new FormData();
  form.append("content", opts.content);
  if (opts.internalNote) form.append("internalNote", "1");
  for (const f of opts.attachments ?? []) {
    form.append("attachments", f, f.name || "file");
  }

  const url = new URL(
    `api/admin/system/tickets/${encodeURIComponent(ticketId)}/messages`,
    tenant.apiUrl.endsWith("/") ? tenant.apiUrl : tenant.apiUrl + "/",
  ).toString();

  const ac = new AbortController();
  const timer = setTimeout(() => ac.abort(), 30_000);
  let logStatus: "success" | "error" = "error";
  let logError: string | null = null;
  try {
    const res = await fetch(url, {
      method: "POST",
      headers: { Authorization: `Bearer ${token}`, Accept: "application/json" },
      body: form,
      signal: ac.signal,
      cache: "no-store",
    });
    clearTimeout(timer);
    if (!res.ok) {
      let body: unknown = null;
      try {
        body = await res.json();
      } catch {
        // ignore
      }
      const message =
        (typeof body === "object" && body && "error" in body
          ? String((body as { error: unknown }).error)
          : null) ?? `HTTP ${res.status}`;
      logError = `${res.status}: ${message}`;
      await logTicketAction(
        tenantId,
        "tenant_ticket_reply",
        {
          ticketId,
          internalNote: Boolean(opts.internalNote),
          attachmentsCount: opts.attachments?.length ?? 0,
        },
        "error",
        logError,
      );
      return { ok: false, error: message };
    }
    logStatus = "success";
    await logTicketAction(
      tenantId,
      "tenant_ticket_reply",
      {
        ticketId,
        internalNote: Boolean(opts.internalNote),
        attachmentsCount: opts.attachments?.length ?? 0,
      },
      "success",
      null,
    );
    return { ok: true };
  } catch (err) {
    clearTimeout(timer);
    const aborted = (err as Error)?.name === "AbortError";
    const message = aborted
      ? "Timeout enviando el mensaje"
      : (err as Error).message;
    if (logStatus === "error") {
      await logTicketAction(
        tenantId,
        "tenant_ticket_reply",
        {
          ticketId,
          internalNote: Boolean(opts.internalNote),
          attachmentsCount: opts.attachments?.length ?? 0,
        },
        "error",
        message,
      );
    }
    return { ok: false, error: message };
  }
}

export async function updateTenantTicketStatus(
  tenantId: string,
  ticketId: string,
  status: "resolved" | "closed",
  oldStatus?: string,
): Promise<{ ok: true } | { ok: false; error: string }> {
  const result = await makeTenantApiCall<{ ok: boolean }>(
    tenantId,
    `/api/admin/system/tickets/${encodeURIComponent(ticketId)}`,
    { method: "PATCH", body: { status }, timeoutMs: 8_000 },
    { action: "tenant_ticket_status_change", logFailures: false },
  );
  if (!result.ok) {
    await logTicketAction(
      tenantId,
      "tenant_ticket_status_change",
      { ticketId, oldStatus: oldStatus ?? null, newStatus: status },
      "error",
      `${result.status}: ${result.error}`,
    );
    return { ok: false, error: result.error };
  }
  await logTicketAction(
    tenantId,
    "tenant_ticket_status_change",
    { ticketId, oldStatus: oldStatus ?? null, newStatus: status },
    "success",
    null,
  );
  return { ok: true };
}

export async function markTenantTicketRead(
  tenantId: string,
  ticketId: string,
): Promise<{ ok: true } | { ok: false; error: string }> {
  const result = await makeTenantApiCall<{ ok: boolean }>(
    tenantId,
    `/api/admin/system/tickets/${encodeURIComponent(ticketId)}/mark-read`,
    { method: "POST", timeoutMs: 5_000 },
    { action: "tenant.tickets.mark_read", logFailures: false },
  );
  if (!result.ok) return { ok: false, error: result.error };
  return { ok: true };
}

export async function downloadTenantAttachment(
  tenantId: string,
  attachmentId: string,
): Promise<
  | {
      ok: true;
      stream: ReadableStream<Uint8Array> | null;
      contentType: string;
      contentDisposition: string | null;
      filename: string | null;
      contentLength: string | null;
    }
  | { ok: false; status: number; error: string }
> {
  const tenant = await prisma.tenant.findUnique({ where: { id: tenantId } });
  if (!tenant) return { ok: false, status: 404, error: "Tenant not found" };
  let token: string;
  try {
    token = decrypt(tenant.apiToken);
  } catch {
    return { ok: false, status: 500, error: "Tenant API token corrupt" };
  }

  const url = new URL(
    `api/admin/system/tickets/attachments/${encodeURIComponent(attachmentId)}`,
    tenant.apiUrl.endsWith("/") ? tenant.apiUrl : tenant.apiUrl + "/",
  ).toString();

  const ac = new AbortController();
  const timer = setTimeout(() => ac.abort(), 30_000);
  try {
    const res = await fetch(url, {
      method: "GET",
      headers: { Authorization: `Bearer ${token}` },
      signal: ac.signal,
      cache: "no-store",
    });
    clearTimeout(timer);
    if (!res.ok) {
      return { ok: false, status: res.status, error: `HTTP ${res.status}` };
    }
    const cd = res.headers.get("content-disposition");
    const filename = parseFilenameFromDisposition(cd);
    return {
      ok: true,
      stream: res.body,
      contentType: res.headers.get("content-type") ?? "application/octet-stream",
      contentDisposition: cd,
      contentLength: res.headers.get("content-length"),
      filename,
    };
  } catch (err) {
    clearTimeout(timer);
    const aborted = (err as Error)?.name === "AbortError";
    return {
      ok: false,
      status: aborted ? 504 : 502,
      error: aborted ? "Timeout descargando" : (err as Error).message,
    };
  }
}

export async function downloadTenantBackup(
  tenantId: string,
  filename: string,
  timeoutMs: number = 5 * 60_000,
): Promise<
  | {
      ok: true;
      stream: ReadableStream<Uint8Array> | null;
      contentType: string;
      contentLength: string | null;
    }
  | { ok: false; status: number; error: string }
> {
  const tenant = await prisma.tenant.findUnique({ where: { id: tenantId } });
  if (!tenant) return { ok: false, status: 404, error: "Tenant not found" };
  let token: string;
  try {
    token = decrypt(tenant.apiToken);
  } catch {
    return { ok: false, status: 500, error: "Tenant API token corrupt" };
  }

  const url = new URL(
    `api/admin/system/backups/${encodeURIComponent(filename)}/download`,
    tenant.apiUrl.endsWith("/") ? tenant.apiUrl : tenant.apiUrl + "/",
  ).toString();

  const ac = new AbortController();
  const timer = setTimeout(() => ac.abort(), timeoutMs);
  try {
    const res = await fetch(url, {
      method: "GET",
      headers: { Authorization: `Bearer ${token}` },
      signal: ac.signal,
      cache: "no-store",
    });
    clearTimeout(timer);
    if (!res.ok) {
      return { ok: false, status: res.status, error: `HTTP ${res.status}` };
    }
    return {
      ok: true,
      stream: res.body,
      contentType: res.headers.get("content-type") ?? "application/octet-stream",
      contentLength: res.headers.get("content-length"),
    };
  } catch (err) {
    clearTimeout(timer);
    const aborted = (err as Error)?.name === "AbortError";
    return {
      ok: false,
      status: aborted ? 504 : 502,
      error: aborted ? "Timeout descargando backup" : (err as Error).message,
    };
  }
}

function parseFilenameFromDisposition(cd: string | null): string | null {
  if (!cd) return null;
  // RFC 5987 filename* preferred when present, else filename=
  const star = /filename\*=(?:[^']*'[^']*')?([^;]+)/i.exec(cd);
  if (star?.[1]) {
    try {
      return decodeURIComponent(star[1].replace(/^"|"$/g, ""));
    } catch {
      // fall through
    }
  }
  const plain = /filename=(?:"([^"]+)"|([^;]+))/i.exec(cd);
  return plain?.[1] ?? plain?.[2]?.trim() ?? null;
}

async function logTicketAction(
  tenantId: string,
  action: string,
  details: Record<string, unknown>,
  status: "success" | "error",
  errorMessage: string | null,
) {
  try {
    await prisma.operationLog.create({
      data: {
        tenantId,
        action,
        status,
        errorMessage: errorMessage ? errorMessage.slice(0, 1000) : null,
        details: details as Prisma.InputJsonValue,
      },
    });
  } catch {
    // swallow
  }
}

export async function logAttachmentDownload(
  tenantId: string,
  ticketId: string | null,
  attachmentId: string,
  filename: string | null,
  status: "success" | "error",
  errorMessage: string | null,
) {
  await logTicketAction(
    tenantId,
    "tenant_ticket_attachment_download",
    { ticketId, attachmentId, filename },
    status,
    errorMessage,
  );
}

// --- PLAN ------------------------------------------------------------------

export interface TenantPlanLimits {
  planSlug: string;
  planName: string;
  maxAdmins: number;
  maxOffice: number;
  maxSales: number;
  multiWarehouse: boolean;
  apiAccess: boolean;
  lastSyncedAt?: string | null;
  syncSource?: string;
}

export interface TenantPlanUsage {
  admins: number;
  office: number;
  sales: number;
  total: number;
}

export interface TenantPlanData {
  limits: TenantPlanLimits;
  usage: TenantPlanUsage;
}

export async function fetchTenantPlan(
  tenantId: string,
): Promise<{ ok: true; data: TenantPlanData } | { ok: false; error: string }> {
  const result = await makeTenantApiCall<TenantPlanData>(
    tenantId,
    "/api/admin/system/plan",
    {},
    { action: "tenant.plan.get", logFailures: false },
  );
  if (!result.ok) return { ok: false, error: result.error };
  return { ok: true, data: result.data };
}

export async function pushTenantPlan(
  tenantId: string,
  payload: {
    planSlug: string;
    planName: string;
    maxAdmins: number;
    maxOffice: number;
    maxSales: number;
    multiWarehouse: boolean;
    apiAccess: boolean;
  },
): Promise<{ ok: true } | { ok: false; error: string }> {
  const result = await makeTenantApiCall<{ ok?: boolean }>(
    tenantId,
    "/api/admin/system/plan",
    { method: "PUT", body: payload, timeoutMs: 10_000 },
    { action: "tenant_plan_sync", logFailures: false },
  );

  if (!result.ok) {
    await prisma.operationLog
      .create({
        data: {
          tenantId,
          action: "tenant_plan_sync",
          status: "error",
          errorMessage: `${result.status}: ${result.error}`.slice(0, 1000),
          details: {
            planSlug: payload.planSlug,
            limitsApplied: payload,
          } as Prisma.InputJsonValue,
        },
      })
      .catch(() => null);
    return { ok: false, error: result.error };
  }

  await prisma.operationLog
    .create({
      data: {
        tenantId,
        action: "tenant_plan_sync",
        status: "success",
        details: {
          planSlug: payload.planSlug,
          limitsApplied: payload,
        } as Prisma.InputJsonValue,
      },
    })
    .catch(() => null);

  return { ok: true };
}

export interface TenantPlanAuditEvent {
  id: string | number;
  field?: string;
  oldValue?: unknown;
  newValue?: unknown;
  performedBy?: string | null;
  reason?: string | null;
  createdAt: string;
}

export async function fetchTenantPlanAudit(
  tenantId: string,
  limit = 20,
): Promise<
  | { ok: true; events: TenantPlanAuditEvent[] }
  | { ok: false; error: string }
> {
  const result = await makeTenantApiCall<
    { events?: TenantPlanAuditEvent[] } | TenantPlanAuditEvent[]
  >(
    tenantId,
    "/api/admin/system/plan/audit",
    { query: { limit } },
    { action: "tenant.plan.audit", logFailures: false },
  );
  if (!result.ok) return { ok: false, error: result.error };
  const data = result.data;
  const events = Array.isArray(data)
    ? data
    : Array.isArray(data?.events)
      ? data!.events!
      : [];
  return { ok: true, events };
}

// ----------------------------------------------------------------------------
// Legacy helpers kept for other tabs (info, backups). Not removed even though
// they're unused right now — they were defined in fase 4.1 and other callers
// may exist.
// ----------------------------------------------------------------------------

export type TenantHealth = {
  status: "ok" | "degraded" | "error";
  uptime?: number;
  database?: { ok: boolean; latencyMs?: number };
  version?: string;
  checkedAt?: string;
};

export type TenantInfo = {
  name?: string;
  version?: string;
  environment?: string;
  hostname?: string;
  features?: Record<string, boolean>;
  [key: string]: unknown;
};

export type TenantBackupItem = {
  id: string;
  filename: string;
  sizeBytes: number;
  createdAt: string;
  type?: string;
};

export const tenantApi = {
  info: (id: string) =>
    makeTenantApiCall<TenantInfo>(id, "/api/admin/system/info", {}, {
      action: "tenant.info",
    }),
  backups: {
    list: (id: string) =>
      makeTenantApiCall<{ backups: TenantBackupItem[] }>(
        id,
        "/api/admin/system/backups",
        {},
        { action: "tenant.backups.list" },
      ),
    create: (id: string) =>
      makeTenantApiCall<TenantBackupItem>(
        id,
        "/api/admin/system/backups",
        { method: "POST" },
        { action: "tenant.backups.create" },
      ),
    restore: (id: string, backupId: string) =>
      makeTenantApiCall<{ ok: true }>(
        id,
        `/api/admin/system/backups/${encodeURIComponent(backupId)}/restore`,
        { method: "POST" },
        { action: "tenant.backups.restore" },
      ),
  },
  invoices: {
    /**
     * Upsert (POST). El cliente guarda/actualiza la factura por `number`.
     */
    push: (
      id: string,
      payload: {
        number: string;
        periodMonth: string;
        amountCents: number;
        status: "pending" | "paid" | "cancelled";
        issuedAt: string;
        dueDate: string | null;
        paidAt: string | null;
        paymentMethod: string | null;
        paymentReference: string | null;
        notes: string | null;
      },
    ) =>
      makeTenantApiCall<{ ok: boolean }>(
        id,
        "/api/admin/system/invoices",
        { method: "POST", body: payload, timeoutMs: 10_000 },
        { action: "tenant.invoices.push" },
      ),
    /**
     * Borra (o cancela) una factura del cliente. El cliente debe aceptar
     * DELETE por `number`.
     */
    delete: (id: string, number: string) =>
      makeTenantApiCall<{ ok: boolean }>(
        id,
        `/api/admin/system/invoices/${encodeURIComponent(number)}`,
        { method: "DELETE" },
        { action: "tenant.invoices.delete" },
      ),
  },
};
