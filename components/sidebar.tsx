"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import { useTransition } from "react";
import {
  LayoutDashboard,
  Building2,
  HardDrive,
  ScrollText,
  LogOut,
} from "lucide-react";
import { Button } from "@/components/ui/button";
import { Separator } from "@/components/ui/separator";
import { cn } from "@/lib/utils";

const NAV = [
  { href: "/", label: "Dashboard", icon: LayoutDashboard, exact: true },
  { href: "/tenants", label: "Clientes", icon: Building2 },
  { href: "/backup-targets", label: "Targets de backup", icon: HardDrive },
  { href: "/logs", label: "Operaciones", icon: ScrollText },
];

function isActive(pathname: string, href: string, exact?: boolean) {
  if (exact) return pathname === href;
  return pathname === href || pathname.startsWith(href + "/");
}

export function Sidebar() {
  const pathname = usePathname();
  const [pending, startTransition] = useTransition();

  async function handleLogout() {
    await fetch("/api/auth/logout", { method: "POST" });
    startTransition(() => {
      window.location.href = "/login";
    });
  }

  return (
    <aside className="flex h-screen w-64 flex-col border-r border-border bg-slate-50 dark:bg-slate-950">
      <div className="flex h-16 items-center px-6">
        <Link href="/" className="flex items-center gap-2">
          <div className="grid size-8 place-items-center rounded-md bg-slate-900 text-white">
            <span className="text-sm font-semibold">M</span>
          </div>
          <div className="flex flex-col">
            <span className="text-sm font-semibold leading-tight">Mercantia</span>
            <span className="text-xs leading-tight text-muted-foreground">
              Admin Panel
            </span>
          </div>
        </Link>
      </div>
      <Separator />
      <nav className="flex-1 space-y-0.5 p-3">
        {NAV.map((item) => {
          const active = isActive(pathname, item.href, item.exact);
          const Icon = item.icon;
          return (
            <Link
              key={item.href}
              href={item.href}
              className={cn(
                "flex items-center gap-3 rounded-md px-3 py-2 text-sm transition-colors",
                active
                  ? "bg-slate-200/70 text-foreground dark:bg-slate-800"
                  : "text-muted-foreground hover:bg-slate-200/40 hover:text-foreground dark:hover:bg-slate-800/60",
              )}
            >
              <Icon className="size-4" />
              {item.label}
            </Link>
          );
        })}
      </nav>
      <Separator />
      <div className="p-3">
        <Button
          variant="ghost"
          className="w-full justify-start text-muted-foreground"
          onClick={handleLogout}
          disabled={pending}
        >
          <LogOut className="size-4" />
          Salir
        </Button>
      </div>
    </aside>
  );
}
