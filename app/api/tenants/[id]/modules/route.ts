import { NextResponse } from "next/server";
import { z } from "zod";
import { getSession } from "@/lib/auth/middleware";
import { fetchTenantModules, toggleTenantModule } from "@/lib/api-client";

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
  const result = await fetchTenantModules(id);
  if (!result.ok) {
    return NextResponse.json(
      { error: result.error },
      { status: 502 },
    );
  }
  return NextResponse.json({ modules: result.modules });
}

const toggleBodySchema = z.object({
  module: z.string().min(1).max(120),
  enabled: z.boolean(),
  reason: z.string().max(500).optional(),
});

export async function POST(
  req: Request,
  { params }: { params: Promise<{ id: string }> },
) {
  const session = await getSession();
  if (!session) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }
  const { id } = await params;

  let body: z.infer<typeof toggleBodySchema>;
  try {
    body = toggleBodySchema.parse(await req.json());
  } catch (e) {
    return NextResponse.json(
      { error: "Cuerpo inválido", detail: (e as Error).message },
      { status: 400 },
    );
  }

  const result = await toggleTenantModule(id, body);
  if (!result.ok) {
    const status = result.code === "DEPENDENCY_BLOCK" ? 409 : 502;
    return NextResponse.json(
      { error: result.error, code: result.code ?? null },
      { status },
    );
  }
  return NextResponse.json({ ok: true });
}
