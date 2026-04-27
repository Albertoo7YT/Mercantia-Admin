import { notFound } from "next/navigation";
import { prisma } from "@/lib/db";
import { PageHeader } from "@/components/page-header";
import { TenantForm } from "../../tenant-form";

type PageProps = { params: Promise<{ id: string }> };

export default async function EditTenantPage({ params }: PageProps) {
  const { id } = await params;
  const tenant = await prisma.tenant.findUnique({ where: { id } });
  if (!tenant) notFound();

  return (
    <>
      <PageHeader
        title={`Editar ${tenant.name}`}
        description="Actualiza los datos del cliente. El token solo se cambia si introduces uno nuevo."
      />
      <TenantForm
        mode="edit"
        tenant={{
          id: tenant.id,
          name: tenant.name,
          slug: tenant.slug,
          apiUrl: tenant.apiUrl,
          status: tenant.status,
          notes: tenant.notes,
        }}
      />
    </>
  );
}
