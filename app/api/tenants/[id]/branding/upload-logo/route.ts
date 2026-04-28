import { NextResponse } from "next/server";
import { getSession } from "@/lib/auth/middleware";
import { uploadTenantLogo } from "@/lib/api-client";
import {
  ACCEPTED_LOGO_MIME,
  MAX_LOGO_BYTES,
} from "@/lib/types/tenant-branding";

export const runtime = "nodejs";

export async function POST(
  req: Request,
  { params }: { params: Promise<{ id: string }> },
) {
  const session = await getSession();
  if (!session) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }
  const { id } = await params;

  let form: FormData;
  try {
    form = await req.formData();
  } catch {
    return NextResponse.json(
      { error: "Cuerpo multipart inválido" },
      { status: 400 },
    );
  }
  const file = form.get("file");
  if (!(file instanceof File)) {
    return NextResponse.json(
      { error: "Falta el archivo en el campo 'file'" },
      { status: 400 },
    );
  }
  if (file.size > MAX_LOGO_BYTES) {
    return NextResponse.json(
      { error: "El archivo supera los 2 MB permitidos" },
      { status: 400 },
    );
  }
  if (file.type && !ACCEPTED_LOGO_MIME.includes(file.type)) {
    return NextResponse.json(
      { error: `Tipo de archivo no permitido (${file.type})` },
      { status: 400 },
    );
  }

  const result = await uploadTenantLogo(id, file);
  if (!result.ok) {
    return NextResponse.json({ error: result.error }, { status: 502 });
  }
  return NextResponse.json({ url: result.url });
}
