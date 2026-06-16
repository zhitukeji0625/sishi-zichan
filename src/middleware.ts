import { NextResponse } from "next/server";
import type { NextRequest } from "next/server";

const PROTECTED_MOBILE_PAGES = ["/m/me", "/m/orders", "/m/contract"];

function isProtectedMobilePage(pathname: string) {
  return PROTECTED_MOBILE_PAGES.some(
    (p) => pathname === p || pathname.startsWith(`${p}/`),
  );
}

export function middleware(request: NextRequest) {
  const { pathname } = request.nextUrl;

  // Admin routes (except login page)
  if (pathname.startsWith("/admin") && !pathname.startsWith("/admin/login")) {
    const session = request.cookies.get("sishi_admin_session");
    if (!session?.value) {
      return NextResponse.redirect(new URL("/admin/login", request.url));
    }
  }

  // Protected mobile pages
  if (isProtectedMobilePage(pathname)) {
    const session = request.cookies.get("sishi_user_session");
    if (!session?.value) {
      return NextResponse.redirect(new URL("/m/login", request.url));
    }
  }

  // Protected mobile API routes
  if (pathname.startsWith("/api/m/")) {
    const session = request.cookies.get("sishi_user_session");
    if (!session?.value) {
      return NextResponse.json({ error: "请先登录" }, { status: 401 });
    }
  }

  return NextResponse.next();
}

export const config = {
  matcher: ["/admin/:path*", "/m/me", "/m/me/:path*", "/m/orders", "/m/orders/:path*", "/m/contract/:path*", "/api/m/:path*"],
};
