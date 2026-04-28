import { NextResponse } from "next/server";
import { getSession } from "@/lib/auth/middleware";
import { deletePayment } from "@/lib/billing";

export const runtime = "nodejs";

export async function DELETE(
  _req: Request,
  { params }: { params: Promise<{ id: string; paymentId: string }> },
) {
  const session = await getSession();
  if (!session) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }
  const { paymentId } = await params;
  await deletePayment(paymentId);
  return NextResponse.json({ ok: true });
}
