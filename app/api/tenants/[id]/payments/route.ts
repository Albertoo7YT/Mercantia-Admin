import { NextResponse } from "next/server";
import { getSession } from "@/lib/auth/middleware";
import { listTenantPayments, recordPayment } from "@/lib/billing";
import { paymentCreateSchema } from "@/lib/validation/payment";
import { eurosToCents } from "@/lib/money";

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
  const payments = await listTenantPayments(id);
  return NextResponse.json({ payments });
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

  let raw: unknown;
  try {
    raw = await req.json();
  } catch {
    return NextResponse.json({ error: "Cuerpo inválido" }, { status: 400 });
  }

  const parsed = paymentCreateSchema.safeParse(raw);
  if (!parsed.success) {
    return NextResponse.json(
      {
        error: "Datos inválidos",
        fieldErrors: parsed.error.flatten().fieldErrors,
      },
      { status: 400 },
    );
  }

  try {
    const payment = await recordPayment({
      tenantId: id,
      amountCents: eurosToCents(parsed.data.amountEuros),
      type: parsed.data.type,
      paidAt: parsed.data.paidAt,
      method: parsed.data.method || null,
      notes: parsed.data.notes || null,
      reference: parsed.data.reference || null,
    });
    return NextResponse.json({ payment });
  } catch (e) {
    return NextResponse.json(
      { error: (e as Error).message },
      { status: 500 },
    );
  }
}
