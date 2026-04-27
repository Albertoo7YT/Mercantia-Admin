import { NextResponse } from "next/server";
import { cookies } from "next/headers";
import { SESSION_COOKIE_NAME } from "@/lib/auth/session";
import { prisma } from "@/lib/db";

export const runtime = "nodejs";

export async function POST() {
  const jar = await cookies();
  jar.set({
    name: SESSION_COOKIE_NAME,
    value: "",
    path: "/",
    maxAge: 0,
    httpOnly: true,
    sameSite: "lax",
  });
  await prisma.operationLog
    .create({
      data: {
        action: "auth.logout",
        actor: "admin",
        status: "success",
      },
    })
    .catch(() => null);
  return NextResponse.json({ ok: true });
}
