"use client";

import { Download, FileText } from "lucide-react";
import type { TenantTicketAttachment } from "@/lib/api-client";
import { cn, formatBytes } from "@/lib/utils";

type Props = {
  tenantId: string;
  ticketId?: string;
  attachment: TenantTicketAttachment;
  className?: string;
};

export function AttachmentCard({
  tenantId,
  ticketId,
  attachment,
  className,
}: Props) {
  const params = new URLSearchParams();
  if (ticketId) params.set("ticketId", ticketId);
  const href = `/api/tenants/${tenantId}/tickets/attachments/${encodeURIComponent(
    attachment.id,
  )}${params.toString() ? `?${params.toString()}` : ""}`;

  return (
    <a
      href={href}
      download={attachment.filename}
      className={cn(
        "group inline-flex max-w-xs items-center gap-2 rounded-md border bg-card px-2 py-1.5 text-xs transition-colors hover:bg-muted/40",
        className,
      )}
      title={attachment.filename}
    >
      <FileText className="size-4 shrink-0 text-muted-foreground" />
      <span className="min-w-0 flex-1 truncate text-foreground">
        {attachment.filename}
      </span>
      <span className="shrink-0 text-muted-foreground">
        {formatBytes(attachment.sizeBytes)}
      </span>
      <Download className="size-3.5 shrink-0 text-muted-foreground opacity-0 transition-opacity group-hover:opacity-100" />
    </a>
  );
}
