"use server";

import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";
import { z } from "zod";
import { prisma } from "@/lib/db";
import { requireAuth } from "@/lib/auth/middleware";
import { eurosToCents } from "@/lib/money";

const updatePlanSchema = z.object({
  name: z.string().min(1).max(120),
  description: z.string().max(500).optional().or(z.literal("")),

  monthlyPriceEuros: z.coerce.number().min(0).max(100_000),
  yearlyPriceEuros: z.coerce.number().min(0).max(1_000_000),

  maxAdmins: z.coerce.number().int().min(0).max(1000),
  maxOffice: z.coerce.number().int().min(0).max(1000),
  maxSales: z.coerce.number().int().min(0).max(1000),

  multiWarehouse: z.coerce.boolean(),
  apiAccess: z.coerce.boolean(),

  isPopular: z.coerce.boolean(),
  active: z.coerce.boolean(),
  sortOrder: z.coerce.number().int().min(0).max(1000),
});

export type UpdatePlanResult =
  | { ok: true; id: string }
  | { ok: false; error: string; fieldErrors?: Record<string, string[]> };

function rawToInput(form: FormData) {
  const obj: Record<string, FormDataEntryValue | undefined> = {};
  for (const k of [
    "name",
    "description",
    "monthlyPriceEuros",
    "yearlyPriceEuros",
    "maxAdmins",
    "maxOffice",
    "maxSales",
    "sortOrder",
  ]) {
    const v = form.get(k);
    obj[k] = v === null ? undefined : v;
  }
  obj.multiWarehouse = form.get("multiWarehouse") === "on" ? "true" : "false";
  obj.apiAccess = form.get("apiAccess") === "on" ? "true" : "false";
  obj.isPopular = form.get("isPopular") === "on" ? "true" : "false";
  obj.active = form.get("active") === "on" ? "true" : "false";
  return obj;
}

export async function updatePlan(
  id: string,
  _prev: unknown,
  raw: FormData,
): Promise<UpdatePlanResult> {
  await requireAuth();
  const parsed = updatePlanSchema.safeParse(rawToInput(raw));
  if (!parsed.success) {
    return {
      ok: false,
      error: "Datos inválidos",
      fieldErrors: parsed.error.flatten().fieldErrors as Record<string, string[]>,
    };
  }
  try {
    await prisma.plan.update({
      where: { id },
      data: {
        name: parsed.data.name,
        description: parsed.data.description || null,
        monthlyPrice: eurosToCents(parsed.data.monthlyPriceEuros),
        yearlyPrice: eurosToCents(parsed.data.yearlyPriceEuros),
        maxAdmins: parsed.data.maxAdmins,
        maxOffice: parsed.data.maxOffice,
        maxSales: parsed.data.maxSales,
        multiWarehouse: parsed.data.multiWarehouse,
        apiAccess: parsed.data.apiAccess,
        isPopular: parsed.data.isPopular,
        active: parsed.data.active,
        sortOrder: parsed.data.sortOrder,
      },
    });
    await prisma.operationLog.create({
      data: {
        action: "plan.update",
        status: "success",
        details: { planId: id },
      },
    });
    revalidatePath("/plans");
    revalidatePath(`/plans/${id}/edit`);
    redirect("/plans");
  } catch (e) {
    const err = e as { message?: string };
    if ((err.message ?? "").startsWith("NEXT_REDIRECT")) throw e;
    return { ok: false, error: err.message ?? "Error desconocido" };
  }
}
