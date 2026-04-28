import { NextResponse } from "next/server";
import { getSession } from "@/lib/auth/middleware";
import {
  fetchTenantLogs,
  type FetchTenantLogsOptions,
  type TenantLogSource,
} from "@/lib/api-client";

export const runtime = "nodejs";

const VALID_SOURCES = new Set<TenantLogSource>(["stdout", "stderr", "combined"]);

export async function GET(
  req: Request,
  { params }: { params: Promise<{ id: string }> },
) {
  const session = await getSession();
  if (!session) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }
  const { id } = await params;
  const url = new URL(req.url);
  const sp = url.searchParams;

  const opts: FetchTenantLogsOptions = {};

  const maxLinesRaw = sp.get("maxLines");
  if (maxLinesRaw) {
    const n = parseInt(maxLinesRaw, 10);
    if (Number.isFinite(n)) opts.maxLines = Math.min(Math.max(n, 1), 5000);
  }

  const source = sp.get("source");
  if (source && VALID_SOURCES.has(source as TenantLogSource)) {
    opts.source = source as TenantLogSource;
  }

  const level = sp.get("level");
  if (level) {
    opts.level = level
      .split(",")
      .map((s) => s.trim())
      .filter(Boolean);
  }

  const since = sp.get("since");
  if (since) opts.since = since;

  const search = sp.get("search");
  if (search) opts.search = search.slice(0, 200);

  const result = await fetchTenantLogs(id, opts);
  if (!result.ok) {
    return NextResponse.json({ error: result.error }, { status: 502 });
  }
  return NextResponse.json(result.data);
}
