import { NextResponse } from "next/server";
import { getSession } from "@/lib/auth/middleware";
import {
  fetchTenantTickets,
  type FetchTenantTicketsFilters,
} from "@/lib/api-client";
import {
  isValidCategory,
  isValidPriority,
  isValidStatus,
} from "@/lib/tickets-constants";

export const runtime = "nodejs";

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

  const filters: FetchTenantTicketsFilters = {};

  const statusRaw = sp.get("status");
  if (statusRaw) {
    const list = statusRaw.split(",").filter(isValidStatus);
    if (list.length > 0) filters.status = list;
  }
  const cat = sp.get("category");
  if (cat && isValidCategory(cat)) filters.category = cat;
  const pri = sp.get("priority");
  if (pri && isValidPriority(pri)) filters.priority = pri;
  const search = sp.get("search");
  if (search) filters.search = search.slice(0, 200);
  if (sp.get("unreadOnly") === "1" || sp.get("unreadOnly") === "true") {
    filters.unreadOnly = true;
  }

  const result = await fetchTenantTickets(id, filters);
  if (!result.ok) {
    return NextResponse.json({ error: result.error }, { status: 502 });
  }
  return NextResponse.json({ tickets: result.tickets });
}
