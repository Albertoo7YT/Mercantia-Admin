import { prisma } from "@/lib/db";
import { decrypt } from "@/lib/crypto";
import {
  annotateDependents,
  type ModuleAuditEvent,
  type ModuleInfo,
} from "@/lib/types/tenant-modules";

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

// ----------------------------------------------------------------------------
// Legacy helpers kept for other tabs (info, branding, backups). Not removed
// even though they're unused right now — they were defined in fase 4.1 and
// other callers may exist.
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

export type TenantBranding = {
  primaryColor?: string;
  logoUrl?: string;
  appName?: string;
  [key: string]: unknown;
};

export const tenantApi = {
  info: (id: string) =>
    makeTenantApiCall<TenantInfo>(id, "/api/admin/system/info", {}, {
      action: "tenant.info",
    }),
  branding: {
    get: (id: string) =>
      makeTenantApiCall<TenantBranding>(
        id,
        "/api/admin/system/branding",
        {},
        { action: "tenant.branding.get" },
      ),
    update: (id: string, payload: TenantBranding) =>
      makeTenantApiCall<TenantBranding>(
        id,
        "/api/admin/system/branding",
        { method: "PUT", body: payload },
        { action: "tenant.branding.update" },
      ),
  },
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
};
