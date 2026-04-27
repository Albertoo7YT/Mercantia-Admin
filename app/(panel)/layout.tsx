import { Sidebar } from "@/components/sidebar";
import { requireAuth } from "@/lib/auth/middleware";

export default async function PanelLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  await requireAuth();

  return (
    <div className="flex min-h-screen bg-background">
      <Sidebar />
      <div className="flex-1">
        <main className="mx-auto max-w-7xl px-8 py-8">{children}</main>
      </div>
    </div>
  );
}
