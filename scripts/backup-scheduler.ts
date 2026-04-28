/**
 * Worker de backups programados.
 *
 * Recorre los tenants con backupScheduleEnabled=true y, si toca según
 * backupScheduleHours, dispara backup_now en el cliente, espera a que
 * aparezca el fichero, lo sincroniza al target y aplica retención.
 *
 * Pensado para ejecutarse cada 15 minutos por cron del sistema.
 *
 * Uso:
 *   node --import tsx scripts/backup-scheduler.ts
 *
 * Variables de entorno requeridas: las mismas que el panel (DATABASE_URL,
 * SESSION_SECRET, etc.). Cargadas vía @next/env igual que la app.
 */
import nextEnv from "@next/env";
nextEnv.loadEnvConfig(process.cwd(), false);

import { prisma } from "@/lib/db";
import {
  triggerTenantAction,
  tenantApi,
  downloadTenantBackup,
} from "@/lib/api-client";
import { applyRetention, ensureRemoteDir, scpUpload } from "@/lib/ssh";
import { Readable } from "node:stream";
import { pipeline } from "node:stream/promises";
import { createWriteStream } from "node:fs";
import { mkdir, rm, stat } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { randomBytes } from "node:crypto";

const POLL_INTERVAL_MS = 5_000;
const POLL_MAX_TRIES = 60; // 5min

type LogPrefix = string;

function log(prefix: LogPrefix, ...args: unknown[]) {
  const ts = new Date().toISOString();
  console.log(`[${ts}] ${prefix}`, ...args);
}

function isDueNow(
  hours: number[],
  lastRunAt: Date | null,
  now: Date = new Date(),
): boolean {
  if (hours.length === 0) return false;
  const currentHour = now.getHours();
  if (!hours.includes(currentHour)) return false;
  if (!lastRunAt) return true;
  // Evita disparar dos veces en la misma hora si el cron del sistema corre cada 15min.
  const lastH = lastRunAt.getHours();
  const sameHour =
    lastRunAt.getFullYear() === now.getFullYear() &&
    lastRunAt.getMonth() === now.getMonth() &&
    lastRunAt.getDate() === now.getDate() &&
    lastH === currentHour;
  return !sameHour;
}

async function pollForNewBackup(
  tenantId: string,
  baselineFilenames: Set<string>,
): Promise<string | null> {
  for (let i = 0; i < POLL_MAX_TRIES; i++) {
    const list = await tenantApi.backups.list(tenantId);
    if (list.ok) {
      const backups = list.data?.backups ?? [];
      const newOnes = backups.filter((b) => !baselineFilenames.has(b.filename));
      if (newOnes.length > 0) {
        const newest = [...newOnes].sort(
          (a, b) =>
            new Date(b.createdAt).getTime() - new Date(a.createdAt).getTime(),
        )[0];
        return newest.filename;
      }
    }
    await new Promise((r) => setTimeout(r, POLL_INTERVAL_MS));
  }
  return null;
}

async function syncBackupFile(
  tenantId: string,
  tenantSlug: string,
  filename: string,
  target: {
    id: string;
    host: string;
    port: number;
    username: string;
    sshKeyPath: string;
    remotePath: string;
  },
  subdir: string,
): Promise<{ ok: true; sizeBytes: number | null; remotePath: string } | { ok: false; error: string }> {
  const start = Date.now();
  const safeBase = filename.replace(/[^A-Za-z0-9._-]/g, "_");
  const tmpDirPath = join(tmpdir(), "mercantia-sync");
  const tmpFile = join(tmpDirPath, `${randomBytes(6).toString("hex")}-${safeBase}`);
  const safeSubdir = subdir.replace(/^\/+|\/+$/g, "");
  const remoteDir = `${target.remotePath.replace(/\/+$/, "")}/${safeSubdir}`;
  const remotePath = `${remoteDir}/${safeBase}`;

  let sizeBytes: number | null = null;
  try {
    await mkdir(tmpDirPath, { recursive: true });

    const dl = await downloadTenantBackup(tenantId, filename);
    if (!dl.ok) return { ok: false, error: `download: ${dl.error}` };
    if (!dl.stream) return { ok: false, error: "download: stream vacío" };

    const nodeStream = Readable.fromWeb(
      dl.stream as unknown as import("node:stream/web").ReadableStream<Uint8Array>,
    );
    await pipeline(nodeStream, createWriteStream(tmpFile));
    try {
      const st = await stat(tmpFile);
      sizeBytes = Number(st.size);
    } catch {
      /* ignore */
    }

    const sshTarget = {
      host: target.host,
      port: target.port,
      username: target.username,
      sshKeyPath: target.sshKeyPath,
    };
    const mk = await ensureRemoteDir(sshTarget, remoteDir);
    if (!mk.ok) {
      return { ok: false, error: `mkdir remoto: ${mk.error}${mk.stderr ? ` · ${mk.stderr}` : ""}` };
    }
    const up = await scpUpload(sshTarget, tmpFile, remotePath);
    if (!up.ok) {
      return { ok: false, error: `scp: ${up.error}${up.stderr ? ` · ${up.stderr}` : ""}` };
    }

    await prisma.backupSync.create({
      data: {
        tenantId,
        backupTargetId: target.id,
        sourceFile: filename,
        status: "success",
        sizeBytes: sizeBytes !== null ? BigInt(sizeBytes) : null,
        durationMs: Date.now() - start,
      },
    });

    return { ok: true, sizeBytes, remotePath };
  } finally {
    try {
      await rm(tmpFile, { force: true });
    } catch {
      /* ignore */
    }
  }
}

async function runForTenant(tenantId: string) {
  const tenant = await prisma.tenant.findUnique({ where: { id: tenantId } });
  if (!tenant) return;
  const prefix = `[${tenant.slug}]`;
  log(prefix, "due — disparando backup");

  const target = tenant.backupTargetId
    ? await prisma.backupTarget.findUnique({ where: { id: tenant.backupTargetId } })
    : await prisma.backupTarget.findFirst({ where: { isDefault: true } });

  if (!target) {
    const errorMessage = "Sin target configurado";
    log(prefix, "ERROR:", errorMessage);
    await prisma.tenant.update({
      where: { id: tenantId },
      data: { backupLastRunAt: new Date(), backupLastRunStatus: "error" },
    });
    await prisma.operationLog.create({
      data: {
        tenantId,
        action: "backup.scheduled",
        status: "error",
        errorMessage,
      },
    });
    return;
  }

  // Snapshot pre-backup para detectar el nuevo fichero
  let baseline = new Set<string>();
  const beforeList = await tenantApi.backups.list(tenantId);
  if (beforeList.ok && beforeList.data) {
    baseline = new Set(beforeList.data.backups.map((b) => b.filename));
  }

  const trigger = await triggerTenantAction(tenantId, "backup_now");
  if (!trigger.ok) {
    const errorMessage = `trigger: ${trigger.error}`;
    log(prefix, "ERROR:", errorMessage);
    await prisma.tenant.update({
      where: { id: tenantId },
      data: { backupLastRunAt: new Date(), backupLastRunStatus: "error" },
    });
    await prisma.operationLog.create({
      data: { tenantId, action: "backup.scheduled", status: "error", errorMessage },
    });
    return;
  }

  log(prefix, "esperando fichero…");
  const newFilename = await pollForNewBackup(tenantId, baseline);
  if (!newFilename) {
    const errorMessage = "Timeout esperando el nuevo fichero del cliente";
    log(prefix, "ERROR:", errorMessage);
    await prisma.tenant.update({
      where: { id: tenantId },
      data: { backupLastRunAt: new Date(), backupLastRunStatus: "error" },
    });
    await prisma.operationLog.create({
      data: { tenantId, action: "backup.scheduled", status: "error", errorMessage },
    });
    return;
  }
  log(prefix, "fichero nuevo:", newFilename);

  const subdir = tenant.backupSubdir ?? tenant.slug;
  const sync = await syncBackupFile(
    tenantId,
    tenant.slug,
    newFilename,
    {
      id: target.id,
      host: target.host,
      port: target.port,
      username: target.username,
      sshKeyPath: target.sshKeyPath,
      remotePath: target.remotePath,
    },
    subdir,
  );

  if (!sync.ok) {
    log(prefix, "sync FAIL:", sync.error);
    await prisma.backupSync.create({
      data: {
        tenantId,
        backupTargetId: target.id,
        sourceFile: newFilename,
        status: "error",
        errorMessage: sync.error,
      },
    });
    await prisma.tenant.update({
      where: { id: tenantId },
      data: { backupLastRunAt: new Date(), backupLastRunStatus: "error" },
    });
    await prisma.operationLog.create({
      data: { tenantId, action: "backup.scheduled", status: "error", errorMessage: sync.error },
    });
    return;
  }

  log(prefix, "sync OK:", sync.remotePath, "(", sync.sizeBytes, "bytes )");

  // Retención
  const retention = await applyRetention(
    {
      host: target.host,
      port: target.port,
      username: target.username,
      sshKeyPath: target.sshKeyPath,
    },
    `${target.remotePath.replace(/\/+$/, "")}/${(tenant.backupSubdir ?? tenant.slug).replace(/^\/+|\/+$/g, "")}`,
    tenant.backupRetention,
  );
  if (retention.ok) {
    if (retention.deleted.length > 0) {
      log(prefix, `retención: borrados ${retention.deleted.length} antiguos`);
    }
  } else {
    log(prefix, "retención FAIL:", retention.error);
  }

  await prisma.tenant.update({
    where: { id: tenantId },
    data: { backupLastRunAt: new Date(), backupLastRunStatus: "success" },
  });
  await prisma.operationLog.create({
    data: {
      tenantId,
      action: "backup.scheduled",
      status: "success",
      details: {
        filename: newFilename,
        remotePath: sync.remotePath,
        sizeBytes: sync.sizeBytes,
        retentionDeleted: retention.ok ? retention.deleted.length : 0,
      },
    },
  });
}

async function main() {
  const startedAt = new Date();
  log("[scheduler]", "tick — buscando tenants debido");

  const tenants = await prisma.tenant.findMany({
    where: { status: { not: "suspended" }, backupScheduleEnabled: true },
    select: {
      id: true,
      slug: true,
      backupScheduleHours: true,
      backupLastRunAt: true,
    },
  });

  const due = tenants.filter((t) =>
    isDueNow(t.backupScheduleHours, t.backupLastRunAt, startedAt),
  );

  if (due.length === 0) {
    log("[scheduler]", `nada que hacer (${tenants.length} tenants programados, 0 debido)`);
    await prisma.$disconnect();
    return;
  }

  log("[scheduler]", `${due.length} tenant(s) a procesar`);

  // Secuencial para no saturar el VPS-B
  for (const t of due) {
    try {
      await runForTenant(t.id);
    } catch (e) {
      log(`[${t.slug}]`, "EXCEPCIÓN:", (e as Error).message);
      await prisma.tenant
        .update({
          where: { id: t.id },
          data: { backupLastRunAt: new Date(), backupLastRunStatus: "error" },
        })
        .catch(() => null);
    }
  }

  await prisma.$disconnect();
  log("[scheduler]", "tick completado en", `${Date.now() - startedAt.getTime()}ms`);
}

main().catch(async (err) => {
  console.error("[scheduler] FATAL:", err);
  await prisma.$disconnect().catch(() => null);
  process.exit(1);
});
