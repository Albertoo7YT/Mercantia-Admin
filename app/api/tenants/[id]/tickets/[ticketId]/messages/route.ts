import { NextResponse } from "next/server";
import { getSession } from "@/lib/auth/middleware";
import { postTenantTicketMessage } from "@/lib/api-client";
import {
  TICKET_MAX_ATTACHMENTS,
  TICKET_MAX_ATTACHMENT_BYTES,
} from "@/lib/tickets-constants";

export const runtime = "nodejs";

export async function POST(
  req: Request,
  { params }: { params: Promise<{ id: string; ticketId: string }> },
) {
  const session = await getSession();
  if (!session) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }
  const { id, ticketId } = await params;

  let form: FormData;
  try {
    form = await req.formData();
  } catch {
    return NextResponse.json(
      { error: "Cuerpo multipart inválido" },
      { status: 400 },
    );
  }

  const content = String(form.get("content") ?? "").trim();
  if (!content || content.length > 5000) {
    return NextResponse.json(
      { error: "El contenido debe tener entre 1 y 5000 caracteres" },
      { status: 400 },
    );
  }
  const internalNoteRaw = form.get("internalNote");
  const internalNote =
    internalNoteRaw === "1" ||
    internalNoteRaw === "true" ||
    internalNoteRaw === "on";

  const attachments: File[] = [];
  for (const entry of form.getAll("attachments")) {
    if (!(entry instanceof File)) continue;
    attachments.push(entry);
  }
  if (attachments.length > TICKET_MAX_ATTACHMENTS) {
    return NextResponse.json(
      { error: `Máximo ${TICKET_MAX_ATTACHMENTS} archivos por mensaje` },
      { status: 400 },
    );
  }
  for (const f of attachments) {
    if (f.size > TICKET_MAX_ATTACHMENT_BYTES) {
      return NextResponse.json(
        { error: `'${f.name}' supera los 5 MB permitidos` },
        { status: 400 },
      );
    }
  }

  const result = await postTenantTicketMessage(id, ticketId, {
    content,
    internalNote,
    attachments,
  });
  if (!result.ok) {
    return NextResponse.json({ error: result.error }, { status: 502 });
  }
  return NextResponse.json({ ok: true });
}
