import { PageHeader } from "@/components/page-header";
import { prisma } from "@/lib/db";
import { TenantForm } from "../tenant-form";

export const metadata = { title: "Nuevo cliente · Mercantia Admin" };

export default async function NewTenantPage() {
  const targets = await prisma.backupTarget.findMany({
    orderBy: [{ isDefault: "desc" }, { name: "asc" }],
    select: {
      id: true,
      name: true,
      host: true,
      remotePath: true,
      isDefault: true,
    },
  });

  return (
    <>
      <PageHeader
        title="Nuevo cliente"
        description="Registra una nueva instancia Mercantia."
      />
      <TenantForm mode="create" backupTargets={targets} />
    </>
  );
}
