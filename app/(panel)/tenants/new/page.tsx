import { PageHeader } from "@/components/page-header";
import { TenantForm } from "../tenant-form";

export const metadata = { title: "Nuevo cliente · Mercantia Admin" };

export default function NewTenantPage() {
  return (
    <>
      <PageHeader
        title="Nuevo cliente"
        description="Registra una nueva instancia Mercantia."
      />
      <TenantForm mode="create" />
    </>
  );
}
