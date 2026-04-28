"use server";

import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";
import { prisma } from "@/lib/db";
import { encrypt } from "@/lib/crypto";
import { requireAuth } from "@/lib/auth/middleware";
import {
  tenantCreateSchema,
  tenantUpdateSchema,
} from "@/lib/validation/tenant";

export type ActionResult =
  | { ok: true; id: string }
  | { ok: false; error: string; fieldErrors?: Record<string, string[]> };

function rawToInput(raw: FormData) {
  const obj: Record<string, FormDataEntryValue | undefined> = {};
  for (const key of [
    "name",
    "slug",
    "apiUrl",
    "apiToken",
    "status",
    "notes",
    "backupTargetId",
    "backupSubdir",
  ]) {
    const v = raw.get(key);
    obj[key] = v === null ? undefined : v;
  }
  // Sentinel del Select cuando el usuario elige "Usar target por defecto"
  if (obj.backupTargetId === "_default") obj.backupTargetId = "";
  return obj;
}

function emptyToNull(v: string | undefined | null) {
  if (v === undefined || v === null) return null;
  const t = v.trim();
  return t.length === 0 ? null : t;
}

export async function createTenant(_prev: unknown, raw: FormData): Promise<ActionResult> {
  await requireAuth();
  const parsed = tenantCreateSchema.safeParse(rawToInput(raw));
  if (!parsed.success) {
    return {
      ok: false,
      error: "Datos inválidos",
      fieldErrors: parsed.error.flatten().fieldErrors as Record<string, string[]>,
    };
  }

  try {
    const created = await prisma.tenant.create({
      data: {
        name: parsed.data.name,
        slug: parsed.data.slug,
        apiUrl: parsed.data.apiUrl,
        apiToken: encrypt(parsed.data.apiToken),
        status: parsed.data.status,
        notes: parsed.data.notes || null,
        backupTargetId: emptyToNull(parsed.data.backupTargetId),
        backupSubdir: emptyToNull(parsed.data.backupSubdir),
      },
    });

    await prisma.operationLog.create({
      data: {
        tenantId: created.id,
        action: "tenant.create",
        status: "success",
        details: { slug: created.slug, apiUrl: created.apiUrl },
      },
    });

    revalidatePath("/tenants");
    redirect(`/tenants/${created.id}`);
  } catch (e) {
    const err = e as { code?: string; message?: string };
    if (err.code === "P2002") {
      return { ok: false, error: "Ya existe un tenant con ese slug." };
    }
    if ((err.message ?? "").startsWith("NEXT_REDIRECT")) throw e;
    return { ok: false, error: err.message ?? "Error desconocido" };
  }
}

export async function updateTenant(
  id: string,
  _prev: unknown,
  raw: FormData,
): Promise<ActionResult> {
  await requireAuth();
  const parsed = tenantUpdateSchema.safeParse(rawToInput(raw));
  if (!parsed.success) {
    return {
      ok: false,
      error: "Datos inválidos",
      fieldErrors: parsed.error.flatten().fieldErrors as Record<string, string[]>,
    };
  }

  const data: Record<string, unknown> = {
    name: parsed.data.name,
    slug: parsed.data.slug,
    apiUrl: parsed.data.apiUrl,
    status: parsed.data.status,
    notes: parsed.data.notes || null,
    backupTargetId: emptyToNull(parsed.data.backupTargetId),
    backupSubdir: emptyToNull(parsed.data.backupSubdir),
  };
  if (parsed.data.apiToken && parsed.data.apiToken.length > 0) {
    data.apiToken = encrypt(parsed.data.apiToken);
  }

  try {
    await prisma.tenant.update({ where: { id }, data });
    await prisma.operationLog.create({
      data: {
        tenantId: id,
        action: "tenant.update",
        status: "success",
        details: { tokenRotated: Boolean(data.apiToken) },
      },
    });
    revalidatePath("/tenants");
    revalidatePath(`/tenants/${id}`);
    redirect(`/tenants/${id}`);
  } catch (e) {
    const err = e as { code?: string; message?: string };
    if (err.code === "P2002") {
      return { ok: false, error: "Ya existe un tenant con ese slug." };
    }
    if ((err.message ?? "").startsWith("NEXT_REDIRECT")) throw e;
    return { ok: false, error: err.message ?? "Error desconocido" };
  }
}

export async function suspendTenant(id: string): Promise<{ ok: boolean; error?: string }> {
  await requireAuth();
  try {
    await prisma.tenant.update({
      where: { id },
      data: { status: "suspended" },
    });
    await prisma.operationLog.create({
      data: {
        tenantId: id,
        action: "tenant.suspend",
        status: "success",
      },
    });
    revalidatePath("/tenants");
    revalidatePath(`/tenants/${id}`);
    return { ok: true };
  } catch (e) {
    return { ok: false, error: (e as Error).message };
  }
}
