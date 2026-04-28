"use client";

import { MessageSquare } from "lucide-react";
import { Badge } from "@/components/ui/badge";
import { TabsTrigger } from "@/components/ui/tabs";
import { useGlobalTicketsUnread } from "@/hooks/use-global-tickets-unread";

export function TicketsTabTrigger({ tenantId }: { tenantId: string }) {
  const { data } = useGlobalTicketsUnread();
  const unread =
    data?.byTenant.find((t) => t.tenantId === tenantId)?.unreadCount ?? 0;
  return (
    <TabsTrigger value="tickets" className="gap-1.5">
      <MessageSquare className="size-3.5" />
      Tickets
      {unread > 0 ? (
        <Badge variant="destructive" className="ml-1">
          {unread}
        </Badge>
      ) : null}
    </TabsTrigger>
  );
}
