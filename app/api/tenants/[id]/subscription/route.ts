import { NextResponse } from "next/server";
import { getSession } from "@/lib/auth/middleware";
import { prisma } from "@/lib/db";
import { upsertSubscription } from "@/lib/plan-resolver";
import { subscriptionUpdateSchema } from "@/lib/validation/subscription";

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
  const subscription = await prisma.tenantSubscription.findUnique({
    where: { tenantId: id },
    include: { plan: true },
  });
  return NextResponse.json({ subscription });
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

  let raw: unknown;
  try {
    raw = await req.json();
  } catch {
    return NextResponse.json({ error: "Cuerpo inválido" }, { status: 400 });
  }

  const parsed = subscriptionUpdateSchema.safeParse(raw);
  if (!parsed.success) {
    return NextResponse.json(
      {
        error: "Datos inválidos",
        fieldErrors: parsed.error.flatten().fieldErrors,
      },
      { status: 400 },
    );
  }

  const previous = await prisma.tenantSubscription.findUnique({
    where: { tenantId: id },
    select: { planId: true },
  });

  // Verify planId references a real plan if provided.
  if (parsed.data.planId) {
    const exists = await prisma.plan.findUnique({
      where: { id: parsed.data.planId },
      select: { id: true },
    });
    if (!exists) {
      return NextResponse.json(
        { error: "Plan no encontrado" },
        { status: 400 },
      );
    }
  }

  const updated = await upsertSubscription(id, parsed.data);

  // Detect what changed so the OperationLog is informative.
  const fieldsChanged = Object.keys(parsed.data);

  if (previous?.planId !== updated.planId) {
    await prisma.operationLog
      .create({
        data: {
          tenantId: id,
          action: "tenant_plan_assign",
          status: "success",
          details: {
            oldPlanId: previous?.planId ?? null,
            newPlanId: updated.planId ?? null,
            newPlanSlug: updated.plan?.slug ?? null,
          },
        },
      })
      .catch(() => null);
  }

  const hasOverrides =
    updated.customMaxAdmins !== null ||
    updated.customMaxOffice !== null ||
    updated.customMaxSales !== null ||
    updated.customMultiWarehouse !== null ||
    updated.customApiAccess !== null;
  if (hasOverrides) {
    await prisma.operationLog
      .create({
        data: {
          tenantId: id,
          action: "tenant_plan_override",
          status: "success",
          details: {
            customMaxAdmins: updated.customMaxAdmins,
            customMaxOffice: updated.customMaxOffice,
            customMaxSales: updated.customMaxSales,
            customMultiWarehouse: updated.customMultiWarehouse,
            customApiAccess: updated.customApiAccess,
          },
        },
      })
      .catch(() => null);
  }

  await prisma.operationLog
    .create({
      data: {
        tenantId: id,
        action: "tenant_subscription_update",
        status: "success",
        details: { fieldsChanged },
      },
    })
    .catch(() => null);

  return NextResponse.json({ subscription: updated });
}
