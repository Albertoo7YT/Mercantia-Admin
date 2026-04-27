import { NextResponse } from "next/server";
import { getSession } from "@/lib/auth/middleware";
import { tenantApi } from "@/lib/api-client";

export const runtime = "nodejs";

export async function GET(
  _req: Request,
  { params }: { params: Promise<{ id: string }> },
) {
  const session = await getSession();
  if (!session) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }
  const { id } = await params;
  const result = await tenantApi.branding.get(id);
  if (!result.ok) {
    return NextResponse.json(
      { error: result.error },
      { status: result.status || 502 },
    );
  }
  return NextResponse.json(result.data ?? {});
}

export async function PUT(
  req: Request,
  { params }: { params: Promise<{ id: string }> },
) {
  const session = await getSession();
  if (!session) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }
  const { id } = await params;
  let body: Record<string, unknown> = {};
  try {
    body = await req.json();
  } catch {
    return NextResponse.json({ error: "Cuerpo inválido" }, { status: 400 });
  }
  const result = await tenantApi.branding.update(id, body);
  if (!result.ok) {
    return NextResponse.json(
      { error: result.error },
      { status: result.status || 502 },
    );
  }
  return NextResponse.json(result.data ?? {});
}
