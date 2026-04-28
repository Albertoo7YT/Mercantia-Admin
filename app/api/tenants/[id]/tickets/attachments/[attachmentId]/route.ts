import { NextResponse } from "next/server";
import { getSession } from "@/lib/auth/middleware";
import {
  downloadTenantAttachment,
  logAttachmentDownload,
} from "@/lib/api-client";

export const runtime = "nodejs";

export async function GET(
  req: Request,
  { params }: { params: Promise<{ id: string; attachmentId: string }> },
) {
  const session = await getSession();
  if (!session) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }
  const { id, attachmentId } = await params;
  const sp = new URL(req.url).searchParams;
  const ticketId = sp.get("ticketId");

  const result = await downloadTenantAttachment(id, attachmentId);
  if (!result.ok) {
    await logAttachmentDownload(
      id,
      ticketId,
      attachmentId,
      null,
      "error",
      `${result.status}: ${result.error}`,
    );
    return NextResponse.json(
      { error: result.error },
      { status: result.status },
    );
  }

  await logAttachmentDownload(
    id,
    ticketId,
    attachmentId,
    result.filename,
    "success",
    null,
  );

  const headers = new Headers();
  headers.set("Content-Type", result.contentType);
  if (result.contentLength) headers.set("Content-Length", result.contentLength);
  if (result.contentDisposition) {
    headers.set("Content-Disposition", result.contentDisposition);
  } else if (result.filename) {
    headers.set(
      "Content-Disposition",
      `attachment; filename="${result.filename.replace(/"/g, "")}"`,
    );
  }
  headers.set("Cache-Control", "no-store");

  return new Response(result.stream, { status: 200, headers });
}
