import { notFound } from "next/navigation";
import { prisma } from "@/lib/db";
import { PageHeader } from "@/components/page-header";
import { TenantForm } from "../../tenant-form";

type PageProps = { params: Promise<{ id: string }> };

export default async function EditTenantPage({ params }: PageProps) {
  const { id } = await params;
  const [tenant, targets] = await Promise.all([
    prisma.tenant.findUnique({ where: { id } }),
    prisma.backupTarget.findMany({
      orderBy: [{ isDefault: "desc" }, { name: "asc" }],
      select: {
        id: true,
        name: true,
        host: true,
        remotePath: true,
        isDefault: true,
      },
    }),
  ]);
  if (!tenant) notFound();

  return (
    <>
      <PageHeader
        title={`Editar ${tenant.name}`}
        description="Actualiza los datos del cliente. El token solo se cambia si introduces uno nuevo."
      />
      <TenantForm
        mode="edit"
        backupTargets={targets}
        tenant={{
          id: tenant.id,
          name: tenant.name,
          slug: tenant.slug,
          apiUrl: tenant.apiUrl,
          status: tenant.status,
          notes: tenant.notes,
          backupTargetId: tenant.backupTargetId,
          backupSubdir: tenant.backupSubdir,
          backupScheduleEnabled: tenant.backupScheduleEnabled,
          backupScheduleHours: tenant.backupScheduleHours,
          backupRetention: tenant.backupRetention,
          backupLastRunAt: tenant.backupLastRunAt
            ? tenant.backupLastRunAt.toISOString()
            : null,
          backupLastRunStatus: tenant.backupLastRunStatus,
        }}
      />
    </>
  );
}
