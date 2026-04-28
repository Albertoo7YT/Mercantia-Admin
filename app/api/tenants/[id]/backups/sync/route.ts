import { NextResponse } from "next/server";
import { z } from "zod";
import { Readable } from "node:stream";
import { pipeline } from "node:stream/promises";
import { createWriteStream } from "node:fs";
import { mkdir, rm, stat } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { randomBytes } from "node:crypto";
import { getSession } from "@/lib/auth/middleware";
import { prisma } from "@/lib/db";
import { downloadTenantBackup } from "@/lib/api-client";
import { ensureRemoteDir, scpUpload } from "@/lib/ssh";

export const runtime = "nodejs";
export const maxDuration = 600;

const bodySchema = z.object({
  filename: z.string().min(1).max(500),
  targetId: z.string().min(1).optional(),
});

export async function POST(
  req: Request,
  { params }: { params: Promise<{ id: string }> },
) {
  const session = await getSession();
  if (!session) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }
  const { id: tenantId } = await params;

  let body: z.infer<typeof bodySchema>;
  try {
    body = bodySchema.parse(await req.json());
  } catch (e) {
    return NextResponse.json(
      { error: "Cuerpo inválido", detail: (e as Error).message },
      { status: 400 },
    );
  }

  const tenant = await prisma.tenant.findUnique({ where: { id: tenantId } });
  if (!tenant) {
    return NextResponse.json({ error: "Tenant no encontrado" }, { status: 404 });
  }

  // Prioridad: targetId del body > target del tenant > target con isDefault=true
  const target = body.targetId
    ? await prisma.backupTarget.findUnique({ where: { id: body.targetId } })
    : tenant.backupTargetId
      ? await prisma.backupTarget.findUnique({
          where: { id: tenant.backupTargetId },
        })
      : await prisma.backupTarget.findFirst({ where: { isDefault: true } });

  if (!target) {
    return NextResponse.json(
      {
        error:
          "No hay target configurado (asigna uno al cliente, marca uno como default o pasa targetId)",
      },
      { status: 400 },
    );
  }

  const start = Date.now();
  const safeBase = body.filename.replace(/[^A-Za-z0-9._-]/g, "_");
  const tmpDir = join(tmpdir(), "mercantia-sync");
  const tmpFile = join(tmpDir, `${randomBytes(6).toString("hex")}-${safeBase}`);
  const subdir = (tenant.backupSubdir ?? tenant.slug)
    .replace(/^\/+|\/+$/g, "");
  const remoteDir = `${target.remotePath.replace(/\/+$/, "")}/${subdir}`;
  const remotePath = `${remoteDir}/${safeBase}`;

  let sizeBytes: number | null = null;
  let errorMessage: string | null = null;

  try {
    await mkdir(tmpDir, { recursive: true });

    // 1) Download from tenant
    const dl = await downloadTenantBackup(tenantId, body.filename);
    if (!dl.ok) {
      throw new Error(`Descarga: ${dl.error}`);
    }
    if (!dl.stream) {
      throw new Error("Descarga: stream vacío");
    }
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

    // 2) Ensure remote directory
    const sshTarget = {
      host: target.host,
      port: target.port,
      username: target.username,
      sshKeyPath: target.sshKeyPath,
    };
    const mk = await ensureRemoteDir(sshTarget, remoteDir);
    if (!mk.ok) {
      throw new Error(
        `mkdir remoto: ${mk.error}${mk.stderr ? ` · ${mk.stderr}` : ""}`,
      );
    }

    // 3) scp upload
    const up = await scpUpload(sshTarget, tmpFile, remotePath);
    if (!up.ok) {
      throw new Error(
        `scp: ${up.error}${up.stderr ? ` · ${up.stderr}` : ""}`,
      );
    }
  } catch (e) {
    errorMessage = (e as Error).message;
  } finally {
    try {
      await rm(tmpFile, { force: true });
    } catch {
      /* ignore */
    }
  }

  const durationMs = Date.now() - start;
  const ok = errorMessage === null;

  await prisma.backupSync.create({
    data: {
      tenantId,
      backupTargetId: target.id,
      sourceFile: body.filename,
      status: ok ? "success" : "error",
      sizeBytes: sizeBytes !== null ? BigInt(sizeBytes) : null,
      durationMs,
      errorMessage,
    },
  });

  await prisma.operationLog.create({
    data: {
      tenantId,
      action: "backup.sync",
      status: ok ? "success" : "error",
      details: {
        targetId: target.id,
        host: target.host,
        filename: body.filename,
        remotePath,
        sizeBytes,
        durationMs,
      },
      errorMessage,
    },
  });

  if (!ok) {
    return NextResponse.json(
      { ok: false, error: errorMessage, durationMs },
      { status: 502 },
    );
  }
  return NextResponse.json({
    ok: true,
    targetId: target.id,
    remotePath,
    sizeBytes,
    durationMs,
  });
}
