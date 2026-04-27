import { PageHeader } from "@/components/page-header";
import { BackupTargetForm } from "../backup-target-form";

export const metadata = { title: "Nuevo target · Mercantia Admin" };

export default function NewBackupTargetPage() {
  return (
    <>
      <PageHeader
        title="Nuevo target de backup"
        description="Configura un destino remoto vía SSH."
      />
      <BackupTargetForm mode="create" />
    </>
  );
}
