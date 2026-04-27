import { notFound, redirect } from "next/navigation";
import { prisma } from "@/lib/db";

type PageProps = { params: Promise<{ id: string }> };

export default async function BackupTargetEditRedirect({ params }: PageProps) {
  const { id } = await params;
  const exists = await prisma.backupTarget.findUnique({ where: { id } });
  if (!exists) notFound();
  redirect(`/backup-targets/${id}/edit`);
}
