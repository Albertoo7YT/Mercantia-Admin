"use server";

import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";
import { prisma } from "@/lib/db";
import { requireAuth } from "@/lib/auth/middleware";
import { backupTargetSchema } from "@/lib/validation/backup-target";

export type BTActionResult =
  | { ok: true; id: string }
  | { ok: false; error: string; fieldErrors?: Record<string, string[]> };

function rawToInput(raw: FormData) {
  return {
    name: raw.get("name") ?? undefined,
    host: raw.get("host") ?? undefined,
    port: raw.get("port") ?? undefined,
    username: raw.get("username") ?? undefined,
    sshKeyPath: raw.get("sshKeyPath") ?? undefined,
    remotePath: raw.get("remotePath") ?? undefined,
    isDefault: raw.get("isDefault") === "on" || raw.get("isDefault") === "true",
  };
}

async function clearOtherDefaults(except?: string) {
  await prisma.backupTarget.updateMany({
    where: { isDefault: true, ...(except ? { id: { not: except } } : {}) },
    data: { isDefault: false },
  });
}

export async function createBackupTarget(
  _prev: unknown,
  raw: FormData,
): Promise<BTActionResult> {
  await requireAuth();
  const parsed = backupTargetSchema.safeParse(rawToInput(raw));
  if (!parsed.success) {
    return {
      ok: false,
      error: "Datos inválidos",
      fieldErrors: parsed.error.flatten().fieldErrors as Record<string, string[]>,
    };
  }

  try {
    if (parsed.data.isDefault) await clearOtherDefaults();
    const created = await prisma.backupTarget.create({ data: parsed.data });
    await prisma.operationLog.create({
      data: {
        action: "backup-target.create",
        status: "success",
        details: { id: created.id, host: created.host },
      },
    });
    revalidatePath("/backup-targets");
    redirect("/backup-targets");
  } catch (e) {
    const err = e as { message?: string };
    if ((err.message ?? "").startsWith("NEXT_REDIRECT")) throw e;
    return { ok: false, error: err.message ?? "Error desconocido" };
  }
}

export async function updateBackupTarget(
  id: string,
  _prev: unknown,
  raw: FormData,
): Promise<BTActionResult> {
  await requireAuth();
  const parsed = backupTargetSchema.safeParse(rawToInput(raw));
  if (!parsed.success) {
    return {
      ok: false,
      error: "Datos inválidos",
      fieldErrors: parsed.error.flatten().fieldErrors as Record<string, string[]>,
    };
  }

  try {
    if (parsed.data.isDefault) await clearOtherDefaults(id);
    await prisma.backupTarget.update({ where: { id }, data: parsed.data });
    await prisma.operationLog.create({
      data: {
        action: "backup-target.update",
        status: "success",
        details: { id },
      },
    });
    revalidatePath("/backup-targets");
    redirect("/backup-targets");
  } catch (e) {
    const err = e as { message?: string };
    if ((err.message ?? "").startsWith("NEXT_REDIRECT")) throw e;
    return { ok: false, error: err.message ?? "Error desconocido" };
  }
}

export async function deleteBackupTarget(id: string): Promise<{ ok: boolean; error?: string }> {
  await requireAuth();
  try {
    await prisma.backupTarget.delete({ where: { id } });
    await prisma.operationLog.create({
      data: {
        action: "backup-target.delete",
        status: "success",
        details: { id },
      },
    });
    revalidatePath("/backup-targets");
    return { ok: true };
  } catch (e) {
    return { ok: false, error: (e as Error).message };
  }
}
