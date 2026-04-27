import { notFound } from "next/navigation";
import { prisma } from "@/lib/db";
import { PageHeader } from "@/components/page-header";
import { BackupTargetForm } from "../../backup-target-form";

type PageProps = { params: Promise<{ id: string }> };

export default async function EditBackupTargetPage({ params }: PageProps) {
  const { id } = await params;
  const target = await prisma.backupTarget.findUnique({ where: { id } });
  if (!target) notFound();

  return (
    <>
      <PageHeader
        title={`Editar ${target.name}`}
        description="Actualiza la configuración del target."
      />
      <BackupTargetForm
        mode="edit"
        target={{
          id: target.id,
          name: target.name,
          host: target.host,
          port: target.port,
          username: target.username,
          sshKeyPath: target.sshKeyPath,
          remotePath: target.remotePath,
          isDefault: target.isDefault,
        }}
      />
    </>
  );
}
