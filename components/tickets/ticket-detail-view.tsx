"use client";

import { useEffect, useRef, useState } from "react";
import Link from "next/link";
import {
  useMutation,
  useQuery,
  useQueryClient,
} from "@tanstack/react-query";
import {
  AlertTriangle,
  CheckCircle2,
  Loader2,
  Lock,
  Paperclip,
  RefreshCcw,
  RotateCcw,
  Send,
  X,
} from "lucide-react";
import { Button } from "@/components/ui/button";
import { Textarea } from "@/components/ui/textarea";
import { Skeleton } from "@/components/ui/skeleton";
import { ErrorState } from "@/components/ui/error-state";
import { Card, CardContent } from "@/components/ui/card";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { TicketCategoryBadge } from "@/components/tickets/category-badge";
import { TicketStatusBadge } from "@/components/tickets/status-badge";
import { TicketPriorityBadge } from "@/components/tickets/priority-badge";
import { MessageBubble } from "@/components/tickets/message-bubble";
import { useToast } from "@/hooks/use-toast";
import {
  isTerminalTicketStatus,
  TICKET_MAX_ATTACHMENT_BYTES,
  TICKET_MAX_ATTACHMENTS,
} from "@/lib/tickets-constants";
import type { TenantTicketDetail } from "@/lib/api-client";
import { cn, formatBytes, formatDate, formatRelativeDate } from "@/lib/utils";

const DETAIL_KEY = (tenantId: string, ticketId: string) =>
  ["tenant", tenantId, "ticket", ticketId] as const;

type Props = {
  tenantId: string;
  tenantName: string;
  ticketId: string;
};

async function getDetail(
  tenantId: string,
  ticketId: string,
): Promise<TenantTicketDetail> {
  const res = await fetch(
    `/api/tenants/${tenantId}/tickets/${ticketId}`,
    { cache: "no-store" },
  );
  if (!res.ok) {
    let body: { error?: string } = {};
    try {
      body = (await res.json()) as { error?: string };
    } catch {
      // ignore
    }
    throw new Error(body.error ?? `HTTP ${res.status}`);
  }
  return (await res.json()) as TenantTicketDetail;
}

async function postReply(
  tenantId: string,
  ticketId: string,
  args: { content: string; internalNote: boolean; files: File[] },
) {
  const form = new FormData();
  form.append("content", args.content);
  if (args.internalNote) form.append("internalNote", "1");
  for (const f of args.files) form.append("attachments", f, f.name);
  const res = await fetch(
    `/api/tenants/${tenantId}/tickets/${ticketId}/messages`,
    { method: "POST", body: form },
  );
  if (!res.ok) {
    let body: { error?: string } = {};
    try {
      body = (await res.json()) as { error?: string };
    } catch {
      // ignore
    }
    throw new Error(body.error ?? `HTTP ${res.status}`);
  }
  return (await res.json()) as { ok: true };
}

async function patchStatus(
  tenantId: string,
  ticketId: string,
  status: "resolved" | "closed",
  oldStatus: string,
) {
  const res = await fetch(`/api/tenants/${tenantId}/tickets/${ticketId}`, {
    method: "PATCH",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ status, oldStatus }),
  });
  if (!res.ok) {
    let body: { error?: string } = {};
    try {
      body = (await res.json()) as { error?: string };
    } catch {
      // ignore
    }
    throw new Error(body.error ?? `HTTP ${res.status}`);
  }
  return (await res.json()) as { ok: true };
}

async function markReadCall(tenantId: string, ticketId: string) {
  await fetch(`/api/tenants/${tenantId}/tickets/${ticketId}/mark-read`, {
    method: "POST",
  }).catch(() => null);
}

export function TicketDetailView({ tenantId, tenantName, ticketId }: Props) {
  const qc = useQueryClient();
  const { toast } = useToast();

  const detail = useQuery({
    queryKey: DETAIL_KEY(tenantId, ticketId),
    queryFn: () => getDetail(tenantId, ticketId),
    refetchInterval: 15_000,
    refetchIntervalInBackground: false,
    staleTime: 5_000,
  });

  // Mark as read when the detail first lands.
  const markedRef = useRef(false);
  useEffect(() => {
    if (markedRef.current) return;
    if (!detail.data) return;
    markedRef.current = true;
    void markReadCall(tenantId, ticketId);
  }, [detail.data, tenantId, ticketId]);

  const reply = useMutation({
    mutationFn: (args: { content: string; internalNote: boolean; files: File[] }) =>
      postReply(tenantId, ticketId, args),
    onSuccess: () => {
      toast({ title: "Respuesta enviada" });
      qc.invalidateQueries({ queryKey: DETAIL_KEY(tenantId, ticketId) });
    },
    onError: (err) => {
      toast({
        title: "No se pudo enviar la respuesta",
        description: (err as Error).message,
        variant: "destructive",
      });
    },
  });

  const status = useMutation({
    mutationFn: (args: { newStatus: "resolved" | "closed"; oldStatus: string }) =>
      patchStatus(tenantId, ticketId, args.newStatus, args.oldStatus),
    onSuccess: (_d, args) => {
      toast({
        title: args.newStatus === "resolved" ? "Ticket resuelto" : "Ticket cerrado",
      });
      qc.invalidateQueries({ queryKey: DETAIL_KEY(tenantId, ticketId) });
    },
    onError: (err) => {
      toast({
        title: "No se pudo cambiar el estado",
        description: (err as Error).message,
        variant: "destructive",
      });
    },
  });

  if (detail.isLoading) {
    return <DetailSkeleton />;
  }
  if (detail.isError || !detail.data) {
    return (
      <ErrorState
        title="No se pudo cargar el ticket"
        onRetry={() => detail.refetch()}
        retrying={detail.isFetching}
        technicalDetail={(detail.error as Error)?.message}
      />
    );
  }

  const { ticket, messages } = detail.data;

  return (
    <div className="space-y-4">
      <Breadcrumb tenantName={tenantName} ticketNumber={ticket.number} />

      <div className="flex flex-wrap items-start justify-between gap-3">
        <div className="space-y-2">
          <h1 className="text-xl font-semibold">{ticket.subject}</h1>
          <div className="flex flex-wrap items-center gap-2">
            <TicketStatusBadge status={ticket.status} />
            <TicketCategoryBadge category={ticket.category} />
            <TicketPriorityBadge priority={ticket.priority} />
          </div>
          <p className="text-xs text-muted-foreground">
            Creado por <span className="text-foreground">{ticket.createdBy?.name}</span>{" "}
            <span className="font-mono">({ticket.createdBy?.email})</span>
          </p>
          <DateLine ticket={ticket} />
        </div>

        <ActionsToolbar
          ticket={ticket}
          isPending={status.isPending}
          onChangeStatus={(newStatus) =>
            status.mutate({ newStatus, oldStatus: ticket.status })
          }
          onRefresh={() => detail.refetch()}
          isRefreshing={detail.isFetching}
        />
      </div>

      <Card>
        <CardContent className="space-y-3 p-4">
          {messages.length === 0 ? (
            <p className="text-sm text-muted-foreground">Sin mensajes aún.</p>
          ) : (
            messages.map((m) => (
              <MessageBubble
                key={m.id}
                tenantId={tenantId}
                ticketId={ticketId}
                message={m}
              />
            ))
          )}
        </CardContent>
      </Card>

      <ReplyForm
        disabled={isTerminalTicketStatus(ticket.status) || reply.isPending}
        terminalReason={
          isTerminalTicketStatus(ticket.status)
            ? "El ticket está cerrado/resuelto. Reábrelo si necesitas responder."
            : undefined
        }
        onSubmit={(args) => reply.mutate(args)}
        pending={reply.isPending}
      />
    </div>
  );
}

// ---------------------------------------------------------------------------

function Breadcrumb({
  tenantName,
  ticketNumber,
}: {
  tenantName: string;
  ticketNumber: number;
}) {
  return (
    <nav className="text-xs text-muted-foreground">
      <Link href="/tickets" className="hover:underline">
        Tickets
      </Link>
      <span className="mx-1.5">›</span>
      <span className="text-foreground">{tenantName}</span>
      <span className="mx-1.5">›</span>
      <span className="text-foreground">#{ticketNumber}</span>
    </nav>
  );
}

function DateLine({ ticket }: { ticket: TenantTicketDetail["ticket"] }) {
  const items: string[] = [];
  if (ticket.createdAt)
    items.push(`creado ${formatRelativeDate(ticket.createdAt)}`);
  if (ticket.lastMessageAt)
    items.push(`último mensaje ${formatRelativeDate(ticket.lastMessageAt)}`);
  if (ticket.resolvedAt)
    items.push(`resuelto ${formatRelativeDate(ticket.resolvedAt)}`);
  if (ticket.closedAt)
    items.push(`cerrado ${formatRelativeDate(ticket.closedAt)}`);
  return (
    <p className="text-xs text-muted-foreground" title={formatDate(ticket.createdAt)}>
      {items.join(" · ")}
    </p>
  );
}

function ActionsToolbar({
  ticket,
  isPending,
  onChangeStatus,
  onRefresh,
  isRefreshing,
}: {
  ticket: TenantTicketDetail["ticket"];
  isPending: boolean;
  onChangeStatus: (s: "resolved" | "closed") => void;
  onRefresh: () => void;
  isRefreshing: boolean;
}) {
  const [confirm, setConfirm] = useState<null | "resolved" | "closed">(null);

  return (
    <div className="flex flex-wrap items-center gap-2">
      <Button size="sm" variant="ghost" onClick={onRefresh} disabled={isRefreshing}>
        <RefreshCcw className={cn("size-4", isRefreshing && "animate-spin")} />
        Refrescar
      </Button>
      {!isTerminalTicketStatus(ticket.status) ? (
        <Button
          size="sm"
          variant="outline"
          disabled={isPending}
          onClick={() => setConfirm("resolved")}
        >
          <CheckCircle2 className="size-4" />
          Marcar como resuelto
        </Button>
      ) : null}
      {ticket.status !== "closed" ? (
        <Button
          size="sm"
          variant="outline"
          disabled={isPending}
          onClick={() => setConfirm("closed")}
        >
          <X className="size-4" />
          Cerrar ticket
        </Button>
      ) : null}
      {ticket.status === "closed" ? (
        <span className="text-xs text-muted-foreground">
          <RotateCcw className="mr-1 inline size-3" />
          Para reabrir, pídeselo al cliente o crea un ticket nuevo.
        </span>
      ) : null}

      <Dialog
        open={confirm !== null}
        onOpenChange={(open) => !open && !isPending && setConfirm(null)}
      >
        <DialogContent>
          <DialogHeader>
            <DialogTitle>
              {confirm === "resolved"
                ? "¿Marcar como resuelto?"
                : "¿Cerrar ticket?"}
            </DialogTitle>
            <DialogDescription>
              {confirm === "resolved"
                ? "El cliente verá el ticket como resuelto y podrá reabrirlo si necesita."
                : "El ticket pasará a estado 'cerrado'. No se podrán enviar más mensajes."}
            </DialogDescription>
          </DialogHeader>
          <DialogFooter>
            <Button variant="ghost" onClick={() => setConfirm(null)} disabled={isPending}>
              Cancelar
            </Button>
            <Button
              onClick={() => {
                if (confirm) {
                  onChangeStatus(confirm);
                  setConfirm(null);
                }
              }}
              disabled={isPending}
            >
              {isPending ? <Loader2 className="size-4 animate-spin" /> : null}
              Confirmar
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  );
}

// ---------------------------------------------------------------------------

function ReplyForm({
  disabled,
  terminalReason,
  onSubmit,
  pending,
}: {
  disabled: boolean;
  terminalReason?: string;
  onSubmit: (args: {
    content: string;
    internalNote: boolean;
    files: File[];
  }) => void;
  pending: boolean;
}) {
  const { toast } = useToast();
  const [content, setContent] = useState("");
  const [internalNote, setInternalNote] = useState(false);
  const [files, setFiles] = useState<File[]>([]);
  const inputRef = useRef<HTMLInputElement | null>(null);

  function handleSelectFiles(list: FileList | null) {
    if (!list) return;
    const incoming = Array.from(list);
    const next = [...files, ...incoming].slice(0, TICKET_MAX_ATTACHMENTS);
    if (incoming.length + files.length > TICKET_MAX_ATTACHMENTS) {
      toast({
        title: "Máximo 5 archivos",
        variant: "destructive",
      });
    }
    for (const f of incoming) {
      if (f.size > TICKET_MAX_ATTACHMENT_BYTES) {
        toast({
          title: `'${f.name}' supera 5 MB`,
          variant: "destructive",
        });
        return;
      }
    }
    setFiles(next);
    if (inputRef.current) inputRef.current.value = "";
  }

  function removeFile(index: number) {
    setFiles((prev) => prev.filter((_, i) => i !== index));
  }

  function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    const trimmed = content.trim();
    if (!trimmed) return;
    onSubmit({ content: trimmed, internalNote, files });
    setContent("");
    setFiles([]);
    setInternalNote(false);
  }

  if (terminalReason) {
    return (
      <Card>
        <CardContent className="flex items-center gap-2 p-4 text-sm text-muted-foreground">
          <AlertTriangle className="size-4 text-amber-600" />
          {terminalReason}
        </CardContent>
      </Card>
    );
  }

  return (
    <Card
      className={cn(
        "sticky bottom-2",
        internalNote && "border-amber-300/60",
      )}
    >
      <form onSubmit={handleSubmit}>
        <CardContent className="space-y-2 p-4">
          {internalNote ? (
            <div className="flex items-center gap-1.5 text-xs font-medium text-amber-800 dark:text-amber-300">
              <Lock className="size-3.5" />
              Esto será una nota interna · solo visible para admin
            </div>
          ) : null}
          <Textarea
            value={content}
            onChange={(e) => setContent(e.target.value)}
            placeholder={
              internalNote
                ? "Anotación interna sobre este ticket…"
                : "Escribe tu respuesta para el cliente…"
            }
            rows={3}
            maxLength={5000}
            disabled={disabled}
          />
          {files.length > 0 ? (
            <ul className="flex flex-wrap gap-1.5">
              {files.map((f, i) => (
                <li
                  key={`${f.name}-${i}`}
                  className="inline-flex items-center gap-1.5 rounded-md border bg-card px-2 py-1 text-xs"
                >
                  <Paperclip className="size-3" />
                  <span className="max-w-[18rem] truncate">{f.name}</span>
                  <span className="text-muted-foreground">
                    {formatBytes(f.size)}
                  </span>
                  <button
                    type="button"
                    onClick={() => removeFile(i)}
                    className="ml-1 text-muted-foreground hover:text-foreground"
                    aria-label={`Quitar ${f.name}`}
                  >
                    <X className="size-3" />
                  </button>
                </li>
              ))}
            </ul>
          ) : null}
          <div className="flex flex-wrap items-center justify-between gap-2">
            <div className="flex items-center gap-3">
              <input
                ref={inputRef}
                type="file"
                multiple
                className="hidden"
                onChange={(e) => handleSelectFiles(e.target.files)}
              />
              <Button
                type="button"
                size="sm"
                variant="outline"
                onClick={() => inputRef.current?.click()}
                disabled={disabled || files.length >= TICKET_MAX_ATTACHMENTS}
              >
                <Paperclip className="size-4" />
                Adjuntar
              </Button>
              <label className="flex items-center gap-1.5 text-xs">
                <input
                  type="checkbox"
                  checked={internalNote}
                  onChange={(e) => setInternalNote(e.target.checked)}
                  disabled={disabled}
                  className="size-4 accent-current"
                />
                <Lock className="size-3.5" />
                Nota interna
              </label>
              <span className="text-xs text-muted-foreground">
                {content.length}/5000
              </span>
            </div>
            <Button
              type="submit"
              size="sm"
              disabled={disabled || pending || content.trim().length === 0}
              className={
                internalNote
                  ? "bg-amber-600 text-white hover:bg-amber-600/90"
                  : undefined
              }
            >
              {pending ? (
                <Loader2 className="size-4 animate-spin" />
              ) : (
                <Send className="size-4" />
              )}
              Enviar
            </Button>
          </div>
        </CardContent>
      </form>
    </Card>
  );
}

function DetailSkeleton() {
  return (
    <div className="space-y-4">
      <Skeleton className="h-3 w-48" />
      <Skeleton className="h-7 w-96" />
      <div className="flex gap-2">
        <Skeleton className="h-5 w-24" />
        <Skeleton className="h-5 w-24" />
        <Skeleton className="h-5 w-24" />
      </div>
      <Card>
        <CardContent className="space-y-3 p-4">
          {Array.from({ length: 3 }).map((_, i) => (
            <Skeleton key={i} className="h-20 w-full" />
          ))}
        </CardContent>
      </Card>
    </div>
  );
}

