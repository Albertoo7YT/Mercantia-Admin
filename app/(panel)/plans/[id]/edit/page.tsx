import { notFound } from "next/navigation";
import { prisma } from "@/lib/db";
import { PageHeader } from "@/components/page-header";
import { PlanEditForm } from "./form";

type PageProps = { params: Promise<{ id: string }> };

export default async function EditPlanPage({ params }: PageProps) {
  const { id } = await params;
  const plan = await prisma.plan.findUnique({
    where: { id },
    include: { _count: { select: { subscriptions: true } } },
  });
  if (!plan) notFound();

  return (
    <>
      <PageHeader
        title={`Editar plan ${plan.name}`}
        description="Cambiar precios o límites afecta a futuros sync. Los clientes ya suscritos no se actualizan automáticamente."
      />
      <PlanEditForm
        plan={{
          id: plan.id,
          slug: plan.slug,
          name: plan.name,
          description: plan.description ?? "",
          monthlyPrice: plan.monthlyPrice,
          yearlyPrice: plan.yearlyPrice,
          maxAdmins: plan.maxAdmins,
          maxOffice: plan.maxOffice,
          maxSales: plan.maxSales,
          multiWarehouse: plan.multiWarehouse,
          apiAccess: plan.apiAccess,
          isPopular: plan.isPopular,
          active: plan.active,
          sortOrder: plan.sortOrder,
        }}
        subscriptionsCount={plan._count.subscriptions}
      />
    </>
  );
}
