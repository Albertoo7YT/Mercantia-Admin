"use client";

import { useEffect, useState } from "react";
import { usePathname, useRouter, useSearchParams } from "next/navigation";
import {
  TicketsFiltersBar,
  type TicketsFilters,
} from "@/components/tickets/filters-bar";
import {
  isValidCategory,
  isValidPriority,
  isValidStatus,
} from "@/lib/tickets-constants";

function parseFilters(sp: URLSearchParams): TicketsFilters {
  const status = (sp.get("status") ?? "")
    .split(",")
    .filter(Boolean)
    .filter(isValidStatus);
  const cat = sp.get("category") ?? undefined;
  const pri = sp.get("priority") ?? undefined;
  return {
    status,
    category: cat && isValidCategory(cat) ? cat : undefined,
    priority: pri && isValidPriority(pri) ? pri : undefined,
    search: sp.get("search") ?? "",
    unreadOnly:
      sp.get("unreadOnly") === "1" || sp.get("unreadOnly") === "true",
    tenantId: sp.get("tenantId") ?? undefined,
  };
}

function serializeFilters(f: TicketsFilters): URLSearchParams {
  const sp = new URLSearchParams();
  if (f.status.length > 0) sp.set("status", f.status.join(","));
  if (f.category) sp.set("category", f.category);
  if (f.priority) sp.set("priority", f.priority);
  if (f.search) sp.set("search", f.search);
  if (f.unreadOnly) sp.set("unreadOnly", "1");
  if (f.tenantId) sp.set("tenantId", f.tenantId);
  return sp;
}

type Props = {
  tenants: Array<{ id: string; name: string }>;
};

export function UrlTicketsFiltersBar({ tenants }: Props) {
  const router = useRouter();
  const pathname = usePathname();
  const searchParams = useSearchParams();

  const [filters, setFilters] = useState<TicketsFilters>(() =>
    parseFilters(searchParams),
  );

  // Re-sync if user navigates back/forward
  useEffect(() => {
    setFilters(parseFilters(searchParams));
  }, [searchParams]);

  // Debounce search updates so we don't push a navigation per keystroke.
  useEffect(() => {
    const sp = serializeFilters(filters);
    const handle = setTimeout(() => {
      const target = sp.toString();
      if (target !== searchParams.toString()) {
        router.replace(`${pathname}${target ? `?${target}` : ""}`, {
          scroll: false,
        });
      }
    }, 250);
    return () => clearTimeout(handle);
  }, [filters, pathname, router, searchParams]);

  return (
    <TicketsFiltersBar
      filters={filters}
      onChange={setFilters}
      tenants={tenants}
      showTenantFilter
    />
  );
}
