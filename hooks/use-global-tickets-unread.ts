"use client";

import { useQuery } from "@tanstack/react-query";

export type UnreadByTenant = {
  tenantId: string;
  tenantName: string;
  unreadCount: number;
  online: boolean;
};

export type UnreadSummary = {
  totalUnread: number;
  byTenant: UnreadByTenant[];
};

async function fetchUnreadSummary(): Promise<UnreadSummary> {
  const res = await fetch("/api/tickets/unread-summary", {
    cache: "no-store",
  });
  if (!res.ok) {
    throw new Error(`HTTP ${res.status}`);
  }
  return (await res.json()) as UnreadSummary;
}

export function useGlobalTicketsUnread() {
  return useQuery({
    queryKey: ["tickets", "unread-summary"],
    queryFn: fetchUnreadSummary,
    refetchInterval: 30_000,
    refetchIntervalInBackground: false,
    staleTime: 15_000,
    retry: 1,
  });
}
