import { NextResponse } from "next/server";
import { z } from "zod";
import { getSession } from "@/lib/auth/middleware";
import {
  listTenantActions,
  triggerTenantAction,
} from "@/lib/api-client";
import { ACTION_TYPES, type ActionType } from "@/lib/types/tenant-actions";

export const runtime = "nodejs";

const triggerBodySchema = z.object({
  type: z.enum(ACTION_TYPES as [ActionType, ...ActionType[]]),
  metadata: z.record(z.string(), z.unknown()).optional(),
});

export async function GET(
  req: Request,
  { params }: { params: Promise<{ id: string }> },
) {
  const session = await getSession();
  if (!session) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }
  const { id } = await params;
  const sp = new URL(req.url).searchParams;
  const limitRaw = sp.get("limit");
  const limit = limitRaw
    ? Math.min(Math.max(parseInt(limitRaw, 10) || 20, 1), 200)
    : 20;
  const status = sp.get("status") ?? undefined;
  const type = sp.get("type") ?? undefined;

  const result = await listTenantActions(id, { limit, status, type });
  if (!result.ok) {
    return NextResponse.json({ error: result.error }, { status: 502 });
  }
  return NextResponse.json({ actions: result.actions });
}

export async function POST(
  req: Request,
  { params }: { params: Promise<{ id: string }> },
) {
  const session = await getSession();
  if (!session) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }
  const { id } = await params;
  let body: z.infer<typeof triggerBodySchema>;
  try {
    body = triggerBodySchema.parse(await req.json());
  } catch (e) {
    return NextResponse.json(
      { error: "Cuerpo inválido", detail: (e as Error).message },
      { status: 400 },
    );
  }

  const result = await triggerTenantAction(id, body.type, body.metadata);
  if (!result.ok) {
    return NextResponse.json({ error: result.error }, { status: 502 });
  }
  return NextResponse.json({
    actionId: result.action.id,
    operationLogId: result.operationLogId,
    action: result.action,
  });
}
