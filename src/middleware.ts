import { NextResponse } from "next/server";
import type { NextRequest } from "next/server";

function isProtectedMobilePage(pathname: string) {
  if (pathname.startsWith("/m/contract/")) return true;
  return pathname === "/m/me" || pathname.startsWith("/m/me/") || pathname === "/m/orders" || pathname.startsWith("/m/orders/");
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

  // Protected mobile pages (server redirect alone returns 200 in some Next builds)
  if (isProtectedMobilePage(pathname)) {
    const session = request.cookies.get("sishi_user_session");
    if (!session?.value) {
      const login = new URL("/m/login", request.url);
      login.searchParams.set("next", pathname);
      return NextResponse.redirect(login);
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
  matcher: ["/admin/:path*", "/api/m/:path*", "/m/me/:path*", "/m/me", "/m/orders/:path*", "/m/orders", "/m/contract/:path*"],
};
