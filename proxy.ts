import { NextRequest, NextResponse } from "next/server";
import { SESSION_COOKIE_NAME, verifySession } from "@/lib/auth/session";

const PUBLIC_PATHS = [/^\/login$/, /^\/api\/auth\//, /^\/api\/health$/];

const STATIC_FILE = /\.(?:png|jpe?g|gif|svg|ico|webp|avif|woff2?|ttf|eot|map|css|js)$/i;

export default function proxy(request: NextRequest) {
  const { pathname } = request.nextUrl;

  if (
    pathname.startsWith("/_next/") ||
    pathname === "/favicon.ico" ||
    STATIC_FILE.test(pathname) ||
    PUBLIC_PATHS.some((re) => re.test(pathname))
  ) {
    return NextResponse.next();
  }

  const token = request.cookies.get(SESSION_COOKIE_NAME)?.value;
  const verified = verifySession(token);

  if (!verified.ok) {
    const url = request.nextUrl.clone();
    url.pathname = "/login";
    if (pathname !== "/") {
      url.searchParams.set("redirect", pathname + request.nextUrl.search);
    }
    return NextResponse.redirect(url);
  }

  return NextResponse.next();
}
