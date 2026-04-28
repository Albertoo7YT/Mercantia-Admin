"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import { useState, useTransition } from "react";
import {
  LayoutDashboard,
  Building2,
  CreditCard,
  HardDrive,
  MessageSquare,
  Menu,
  Receipt,
  ScrollText,
  Tag,
  LogOut,
} from "lucide-react";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import {
  Sheet,
  SheetContent,
  SheetDescription,
  SheetTitle,
  SheetTrigger,
} from "@/components/ui/sheet";
import { useGlobalTicketsUnread } from "@/hooks/use-global-tickets-unread";
import { cn } from "@/lib/utils";

type NavItem = {
  href: string;
  label: string;
  icon: React.ComponentType<{ className?: string }>;
  exact?: boolean;
  withTicketsBadge?: boolean;
};

const NAV: NavItem[] = [
  { href: "/", label: "Dashboard", icon: LayoutDashboard, exact: true },
  { href: "/tenants", label: "Clientes", icon: Building2 },
  { href: "/billing", label: "Facturación", icon: Receipt },
  { href: "/subscriptions", label: "Suscripciones", icon: CreditCard },
  { href: "/plans", label: "Planes", icon: Tag },
  {
    href: "/tickets",
    label: "Tickets",
    icon: MessageSquare,
    withTicketsBadge: true,
  },
  { href: "/backup-targets", label: "Targets de backup", icon: HardDrive },
  { href: "/logs", label: "Operaciones", icon: ScrollText },
];

function isActive(pathname: string, href: string, exact?: boolean) {
  if (exact) return pathname === href;
  return pathname === href || pathname.startsWith(href + "/");
}

function SidebarHeader() {
  return (
    <div className="flex h-16 shrink-0 items-center border-b border-border px-6">
      <Link href="/" className="flex items-center">
        {/* eslint-disable-next-line @next/next/no-img-element */}
        <img
          src="https://mercantia.pro/logo.png"
          alt="Mercantia"
          className="h-7 w-auto"
        />
      </Link>
    </div>
  );
}

function SidebarNav({
  pathname,
  totalUnread,
  onNavigate,
}: {
  pathname: string;
  totalUnread: number;
  onNavigate?: () => void;
}) {
  return (
    <nav className="flex-1 space-y-0.5 overflow-y-auto p-3">
      {NAV.map((item) => {
        const active = isActive(pathname, item.href, item.exact);
        const Icon = item.icon;
        return (
          <Link
            key={item.href}
            href={item.href}
            onClick={onNavigate}
            className={cn(
              "flex items-center gap-3 rounded-md px-3 py-2 text-sm transition-colors",
              active
                ? "bg-slate-200/70 text-foreground dark:bg-slate-800"
                : "text-muted-foreground hover:bg-slate-200/40 hover:text-foreground dark:hover:bg-slate-800/60",
            )}
          >
            <Icon className="size-4" />
            <span className="flex-1">{item.label}</span>
            {item.withTicketsBadge && totalUnread > 0 ? (
              <Badge variant="destructive">{totalUnread}</Badge>
            ) : null}
          </Link>
        );
      })}
    </nav>
  );
}

function SidebarFooter({
  pending,
  onLogout,
}: {
  pending: boolean;
  onLogout: () => void;
}) {
  return (
    <div className="border-t border-border p-3">
      <Button
        variant="ghost"
        className="w-full justify-start text-muted-foreground"
        onClick={onLogout}
        disabled={pending}
      >
        <LogOut className="size-4" />
        Salir
      </Button>
    </div>
  );
}

function useLogout() {
  const [pending, startTransition] = useTransition();
  async function handleLogout() {
    await fetch("/api/auth/logout", { method: "POST" });
    startTransition(() => {
      window.location.href = "/login";
    });
  }
  return { pending, handleLogout };
}

/**
 * Sidebar fijo de escritorio. Oculto en pantallas pequeñas.
 */
export function Sidebar() {
  const pathname = usePathname();
  const { data: unread } = useGlobalTicketsUnread();
  const totalUnread = unread?.totalUnread ?? 0;
  const { pending, handleLogout } = useLogout();

  return (
    <aside className="sticky top-0 hidden h-screen w-64 shrink-0 flex-col border-r border-border bg-slate-50 dark:bg-slate-950 md:flex">
      <SidebarHeader />
      <SidebarNav pathname={pathname} totalUnread={totalUnread} />
      <SidebarFooter pending={pending} onLogout={handleLogout} />
    </aside>
  );
}

/**
 * Top bar móvil con hamburguesa. Abre el sidebar como drawer (Sheet).
 * Visible solo en pantallas pequeñas.
 */
export function MobileNav() {
  const pathname = usePathname();
  const { data: unread } = useGlobalTicketsUnread();
  const totalUnread = unread?.totalUnread ?? 0;
  const { pending, handleLogout } = useLogout();
  const [open, setOpen] = useState(false);

  return (
    <header className="sticky top-0 z-40 flex h-14 items-center gap-3 border-b border-border bg-background/95 px-4 backdrop-blur md:hidden">
      <Sheet open={open} onOpenChange={setOpen}>
        <SheetTrigger asChild>
          <Button
            variant="ghost"
            size="icon"
            aria-label="Abrir menú"
            className="size-9"
          >
            <Menu className="size-5" />
          </Button>
        </SheetTrigger>
        <SheetContent
          side="left"
          className="flex flex-col bg-slate-50 p-0 dark:bg-slate-950"
        >
          <SheetTitle className="sr-only">Menú principal</SheetTitle>
          <SheetDescription className="sr-only">
            Navegación del panel admin de Mercantia.
          </SheetDescription>
          <SidebarHeader />
          <SidebarNav
            pathname={pathname}
            totalUnread={totalUnread}
            onNavigate={() => setOpen(false)}
          />
          <SidebarFooter pending={pending} onLogout={handleLogout} />
        </SheetContent>
      </Sheet>

      <Link href="/" className="flex items-center gap-2">
        {/* eslint-disable-next-line @next/next/no-img-element */}
        <img
          src="https://mercantia.pro/logo.png"
          alt="Mercantia"
          className="h-7 w-auto"
        />
        <span className="text-sm font-semibold">Admin</span>
      </Link>

      {totalUnread > 0 ? (
        <Badge variant="destructive" className="ml-auto">
          {totalUnread}
        </Badge>
      ) : null}
    </header>
  );
}
