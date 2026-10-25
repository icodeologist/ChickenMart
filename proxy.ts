import { NextRequest, NextResponse } from "next/server";
import { SESSION_COOKIE, verifySessionToken } from "@/lib/auth";

const publicPaths = new Set(["/login", "/api/auth/login", "/api/auth/logout"]);

export async function proxy(request: NextRequest) {
  const pathname = request.nextUrl.pathname;
  const authenticated = await verifySessionToken(request.cookies.get(SESSION_COOKIE)?.value);

  if (publicPaths.has(pathname)) {
    if (pathname === "/login" && authenticated) {
      return NextResponse.redirect(new URL("/admin", request.url));
    }
    return NextResponse.next();
  }

  if (!authenticated) {
    if (pathname.startsWith("/api/")) {
      return NextResponse.json({ error: "Please sign in." }, { status: 401 });
    }
    const loginUrl = new URL("/login", request.url);
    loginUrl.searchParams.set("next", pathname);
    return NextResponse.redirect(loginUrl);
  }

  return NextResponse.next();
}

export const config = {
  matcher: ["/((?!_next/static|_next/image|favicon.ico|.*\\.(?:svg|png|jpg|jpeg|gif|webp)$).*)"],
};
