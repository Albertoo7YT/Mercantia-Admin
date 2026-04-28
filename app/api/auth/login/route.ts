import { NextResponse } from "next/server";
import { cookies } from "next/headers";
import bcrypt from "bcryptjs";
import { z } from "zod";
import { prisma } from "@/lib/db";
import { createSession, sessionCookieOptions } from "@/lib/auth/session";
import { getAdminPasswordHash } from "@/lib/auth/admin-password";

export const runtime = "nodejs";

const bodySchema = z.object({ password: z.string().min(1).max(256) });

const FAIL_DELAY_MS = 600;

async function delayFor(ms: number) {
  await new Promise((r) => setTimeout(r, ms));
}

export async function POST(request: Request) {
  let parsed: { password: string };
  try {
    const json = await request.json();
    parsed = bodySchema.parse(json);
  } catch {
    return NextResponse.json({ error: "Cuerpo inválido" }, { status: 400 });
  }

  const hash = getAdminPasswordHash();
  let valid = false;
  try {
    valid = await bcrypt.compare(parsed.password, hash);
  } catch {
    valid = false;
  }

  if (!valid) {
    await delayFor(FAIL_DELAY_MS);
    await prisma.operationLog
      .create({
        data: {
          action: "auth.login.failed",
          actor: "anonymous",
          status: "error",
          errorMessage: "Bad credentials",
        },
      })
      .catch(() => null);
    return NextResponse.json({ error: "Credenciales incorrectas" }, { status: 401 });
  }

  const { token, expiresAt } = createSession();
  const opts = sessionCookieOptions(expiresAt);
  const jar = await cookies();
  jar.set({ ...opts, value: token });

  await prisma.operationLog
    .create({
      data: {
        action: "auth.login.success",
        actor: "admin",
        status: "success",
      },
    })
    .catch(() => null);

  return NextResponse.json({ ok: true });
}
