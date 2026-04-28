"use client";

import { Lock } from "lucide-react";
import {
  Tooltip,
  TooltipContent,
  TooltipTrigger,
} from "@/components/ui/tooltip";
import { AttachmentCard } from "@/components/tickets/attachment-card";
import type {
  TenantTicketAttachment,
  TenantTicketMessage,
} from "@/lib/api-client";
import { cn, formatDate, formatRelativeDate } from "@/lib/utils";

type Props = {
  tenantId: string;
  ticketId: string;
  message: TenantTicketMessage;
};

export function MessageBubble({ tenantId, ticketId, message }: Props) {
  const isAdmin = message.senderType === "admin";
  const isInternal = message.internalNote;
  const attachments = message.attachments ?? [];

  if (isInternal) {
    return (
      <div
        data-testid="ticket-message"
        data-internal="true"
        className="rounded-md border border-amber-300/60 bg-amber-50/70 p-3 text-sm dark:bg-amber-950/20"
      >
        <div className="mb-1.5 flex items-center gap-1.5 text-xs font-medium text-amber-800 dark:text-amber-300">
          <Lock className="size-3.5" />
          Nota interna · solo visible para admin
        </div>
        <Header message={message} alignEnd={isAdmin} />
        <p className="whitespace-pre-wrap break-words text-foreground">
          {message.content}
        </p>
        {attachments.length > 0 ? (
          <Attachments
            tenantId={tenantId}
            ticketId={ticketId}
            attachments={attachments}
          />
        ) : null}
      </div>
    );
  }

  const initials = (message.senderName || (isAdmin ? "M" : "U"))
    .split(" ")
    .map((s) => s[0])
    .filter(Boolean)
    .slice(0, 2)
    .join("")
    .toUpperCase();

  return (
    <div
      data-testid="ticket-message"
      className={cn(
        "flex gap-2",
        isAdmin ? "flex-row-reverse" : "flex-row",
      )}
    >
      <div
        className={cn(
          "grid size-8 shrink-0 place-items-center rounded-full text-xs font-semibold",
          isAdmin
            ? "bg-sky-100 text-sky-700 dark:bg-sky-900/40 dark:text-sky-200"
            : "bg-slate-200 text-slate-700 dark:bg-slate-800 dark:text-slate-200",
        )}
      >
        {isAdmin ? "M" : initials || "U"}
      </div>
      <div
        className={cn(
          "min-w-0 flex-1 max-w-[80%] rounded-md border px-3 py-2 text-sm",
          isAdmin
            ? "ml-auto bg-sky-50/70 dark:bg-sky-950/20"
            : "bg-card",
        )}
      >
        <Header message={message} alignEnd={isAdmin} />
        <p className="whitespace-pre-wrap break-words text-foreground">
          {message.content}
        </p>
        {attachments.length > 0 ? (
          <Attachments
            tenantId={tenantId}
            ticketId={ticketId}
            attachments={attachments}
          />
        ) : null}
      </div>
    </div>
  );
}

function Header({
  message,
  alignEnd,
}: {
  message: TenantTicketMessage;
  alignEnd: boolean;
}) {
  return (
    <div
      className={cn(
        "mb-1 flex items-baseline gap-2 text-xs",
        alignEnd && "flex-row-reverse",
      )}
    >
      <span className="font-medium text-foreground">{message.senderName}</span>
      <Tooltip>
        <TooltipTrigger asChild>
          <span className="text-muted-foreground">
            {formatRelativeDate(message.createdAt)}
          </span>
        </TooltipTrigger>
        <TooltipContent>
          <span className="text-xs">{formatDate(message.createdAt)}</span>
        </TooltipContent>
      </Tooltip>
    </div>
  );
}

function Attachments({
  tenantId,
  ticketId,
  attachments,
}: {
  tenantId: string;
  ticketId: string;
  attachments: TenantTicketAttachment[];
}) {
  return (
    <div className="mt-2 flex flex-wrap gap-1.5">
      {attachments.map((a) => (
        <AttachmentCard
          key={a.id}
          tenantId={tenantId}
          ticketId={ticketId}
          attachment={a}
        />
      ))}
    </div>
  );
}
