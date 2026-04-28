import { NextResponse } from "next/server";
import { getSession } from "@/lib/auth/middleware";
import {
  fetchTenantBranding,
  updateTenantBranding,
} from "@/lib/api-client";
import {
  BRANDING_FIELDS,
  validateBranding,
  type TenantBrandingPayload,
} from "@/lib/types/tenant-branding";

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
  const result = await fetchTenantBranding(id);
  if (!result.ok) {
    return NextResponse.json({ error: result.error }, { status: 502 });
  }
  return NextResponse.json(result.data);
}

const ALLOWED = new Set<string>(BRANDING_FIELDS);

export async function PUT(
  req: Request,
  { params }: { params: Promise<{ id: string }> },
) {
  const session = await getSession();
  if (!session) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }
  const { id } = await params;

  let raw: Record<string, unknown>;
  try {
    raw = (await req.json()) as Record<string, unknown>;
  } catch {
    return NextResponse.json({ error: "Cuerpo inválido" }, { status: 400 });
  }
  if (!raw || typeof raw !== "object") {
    return NextResponse.json({ error: "Cuerpo inválido" }, { status: 400 });
  }

  // Whitelist fields and coerce empty strings to undefined for optional ones.
  const payload: Partial<TenantBrandingPayload> = {};
  for (const [k, v] of Object.entries(raw)) {
    if (!ALLOWED.has(k)) continue;
    if (typeof v !== "string") continue;
    (payload as Record<string, string>)[k] = v;
  }

  const errors = validateBranding(payload);
  if (Object.keys(errors).length > 0) {
    return NextResponse.json(
      { error: "Validación fallida", fieldErrors: errors },
      { status: 400 },
    );
  }

  const result = await updateTenantBranding(id, payload);
  if (!result.ok) {
    return NextResponse.json({ error: result.error }, { status: 502 });
  }
  return NextResponse.json(result.data);
}
