import { redirect } from "next/navigation";
import { LoginForm } from "./login-form";
import { getSession } from "@/lib/auth/middleware";

export const metadata = { title: "Acceder · Mercantia Admin" };

type Props = {
  searchParams: Promise<{ redirect?: string }>;
};

export default async function LoginPage({ searchParams }: Props) {
  const { redirect: redirectTo } = await searchParams;
  const session = await getSession();
  if (session) {
    redirect(redirectTo && redirectTo.startsWith("/") ? redirectTo : "/");
  }

  return (
    <main className="grid min-h-screen place-items-center bg-gradient-to-br from-slate-50 via-white to-slate-100 dark:from-slate-950 dark:via-slate-900 dark:to-slate-950">
      <div className="w-full max-w-sm px-6">
        <div className="mb-8 text-center">
          <div className="mx-auto mb-3 grid size-12 place-items-center rounded-xl bg-slate-900 text-white shadow-sm">
            <span className="text-lg font-semibold">M</span>
          </div>
          <h1 className="text-xl font-semibold tracking-tight">
            Mercantia Admin
          </h1>
          <p className="mt-1 text-sm text-muted-foreground">
            Accede con tu contraseña de administración.
          </p>
        </div>
        <LoginForm redirectTo={redirectTo} />
      </div>
    </main>
  );
}
