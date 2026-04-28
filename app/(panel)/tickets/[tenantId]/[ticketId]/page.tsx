import { notFound } from "next/navigation";
import { prisma } from "@/lib/db";
import { TicketDetailView } from "@/components/tickets/ticket-detail-view";

export const dynamic = "force-dynamic";

type PageProps = {
  params: Promise<{ tenantId: string; ticketId: string }>;
};

export default async function TicketDetailPage({ params }: PageProps) {
  const { tenantId, ticketId } = await params;
  const tenant = await prisma.tenant.findUnique({
    where: { id: tenantId },
    select: { id: true, name: true },
  });
  if (!tenant) notFound();

  return (
    <TicketDetailView
      tenantId={tenant.id}
      tenantName={tenant.name}
      ticketId={ticketId}
    />
  );
}
