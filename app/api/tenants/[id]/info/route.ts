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
  const result = await tenantApi.info(id);
  if (!result.ok) {
    return NextResponse.json(
      { error: result.error },
      { status: result.status || 502 },
    );
  }
  return NextResponse.json(result.data ?? {});
}
