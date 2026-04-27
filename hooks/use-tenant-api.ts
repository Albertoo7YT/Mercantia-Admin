"use client";

import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";

async function getJson<T>(url: string): Promise<T> {
  const res = await fetch(url, { cache: "no-store" });
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
    throw new Error(message);
  }
  return (await res.json()) as T;
}

async function sendJson<T>(url: string, method: string, body?: unknown): Promise<T> {
  const res = await fetch(url, {
    method,
    headers: { "Content-Type": "application/json" },
    body: body !== undefined ? JSON.stringify(body) : undefined,
    cache: "no-store",
  });
  if (!res.ok) {
    let parsed: unknown = null;
    try {
      parsed = await res.json();
    } catch {
      // ignore
    }
    const message =
      (typeof parsed === "object" && parsed && "error" in parsed
        ? String((parsed as { error: unknown }).error)
        : null) ?? `HTTP ${res.status}`;
    throw new Error(message);
  }
  return (await res.json()) as T;
}

export function useTenantHealth(tenantId: string) {
  return useQuery({
    queryKey: ["tenant", tenantId, "health"],
    queryFn: () => getJson<{ status: string; message?: string }>(
      `/api/tenants/${tenantId}/health`,
    ),
    refetchInterval: 60_000,
  });
}

export function useTenantInfo(tenantId: string) {
  return useQuery({
    queryKey: ["tenant", tenantId, "info"],
    queryFn: () => getJson<Record<string, unknown>>(`/api/tenants/${tenantId}/info`),
  });
}

export function useTenantModules(tenantId: string) {
  return useQuery({
    queryKey: ["tenant", tenantId, "modules"],
    queryFn: () =>
      getJson<{ modules: Array<{ name: string; enabled: boolean }> }>(
        `/api/tenants/${tenantId}/modules`,
      ),
  });
}

export function useToggleTenantModule(tenantId: string) {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: (params: { module: string; enabled: boolean; reason?: string }) =>
      sendJson<{ ok: true }>(
        `/api/tenants/${tenantId}/modules`,
        "POST",
        params,
      ),
    onSuccess: () => qc.invalidateQueries({ queryKey: ["tenant", tenantId, "modules"] }),
  });
}

export function useTenantBranding(tenantId: string) {
  return useQuery({
    queryKey: ["tenant", tenantId, "branding"],
    queryFn: () => getJson<Record<string, unknown>>(
      `/api/tenants/${tenantId}/branding`,
    ),
  });
}

export function useUpdateTenantBranding(tenantId: string) {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: (payload: Record<string, unknown>) =>
      sendJson<Record<string, unknown>>(
        `/api/tenants/${tenantId}/branding`,
        "PUT",
        payload,
      ),
    onSuccess: () =>
      qc.invalidateQueries({ queryKey: ["tenant", tenantId, "branding"] }),
  });
}

export function useTenantBackups(tenantId: string) {
  return useQuery({
    queryKey: ["tenant", tenantId, "backups"],
    queryFn: () => getJson<{ backups: Array<{ id: string; filename: string; sizeBytes: number; createdAt: string }> }>(
      `/api/tenants/${tenantId}/backups`,
    ),
  });
}

export function useCreateTenantBackup(tenantId: string) {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: () =>
      sendJson<{ id: string; filename: string }>(
        `/api/tenants/${tenantId}/backups`,
        "POST",
      ),
    onSuccess: () =>
      qc.invalidateQueries({ queryKey: ["tenant", tenantId, "backups"] }),
  });
}

export function useRestoreTenantBackup(tenantId: string) {
  return useMutation({
    mutationFn: (backupId: string) =>
      sendJson<{ ok: true }>(
        `/api/tenants/${tenantId}/backups/${encodeURIComponent(backupId)}/restore`,
        "POST",
      ),
  });
}
