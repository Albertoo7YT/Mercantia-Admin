import { cookies } from "next/headers";
import { redirect } from "next/navigation";
import { SESSION_COOKIE_NAME, verifySession } from "./session";

export type Session = {
  expiresAt: Date;
};

export async function getSession(): Promise<Session | null> {
  const jar = await cookies();
  const token = jar.get(SESSION_COOKIE_NAME)?.value;
  const verified = verifySession(token);
  if (!verified.ok) return null;
  return { expiresAt: verified.expiresAt };
}

export async function requireAuth(redirectPath?: string): Promise<Session> {
  const session = await getSession();
  if (!session) {
    const dest = redirectPath
      ? `/login?redirect=${encodeURIComponent(redirectPath)}`
      : "/login";
    redirect(dest);
  }
  return session;
}
