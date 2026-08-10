import { NextResponse } from "next/server";
import type { NextRequest } from "next/server";
import { isAdminIpAllowedForRequest } from "@/lib/auth/ip-allowlist";
import {
  ADMIN_SESSION_COOKIE,
  verifyAdminSessionToken,
} from "@/lib/auth/session-cookie";

function applySecurityHeaders(response: NextResponse) {
  response.headers.set("X-Content-Type-Options", "nosniff");
  response.headers.set("X-Frame-Options", "DENY");
  response.headers.set("Referrer-Policy", "strict-origin-when-cross-origin");
  response.headers.set(
    "Permissions-Policy",
    "camera=(), microphone=(), geolocation=(), payment=()",
  );
  const scriptSrc =
    process.env.NODE_ENV === "production"
      ? "script-src 'self' 'unsafe-inline'"
      : "script-src 'self' 'unsafe-inline' 'unsafe-eval'";
  response.headers.set(
    "Content-Security-Policy",
    [
      "default-src 'self'",
      scriptSrc,
      "style-src 'self' 'unsafe-inline'",
      "img-src 'self' data: blob: https:",
      "font-src 'self' data:",
      "connect-src 'self'",
      "frame-ancestors 'none'",
      "base-uri 'self'",
      "form-action 'self'",
    ].join("; "),
  );
  return response;
}

async function hasValidAdminSession(request: NextRequest): Promise<boolean> {
  const token = request.cookies.get(ADMIN_SESSION_COOKIE)?.value;
  if (!token) return false;
  const secret = process.env.SESSION_SECRET ?? "";
  return verifyAdminSessionToken(token, secret);
}

function denyAdminIp(request: NextRequest): NextResponse | null {
  if (
    !request.nextUrl.pathname.startsWith("/admin") &&
    !request.nextUrl.pathname.startsWith("/api/admin")
  ) {
    return null;
  }
  if (isAdminIpAllowedForRequest(request.headers)) return null;

  if (request.nextUrl.pathname.startsWith("/api/")) {
    return applySecurityHeaders(
      NextResponse.json({ error: "Forbidden", code: "IP_NOT_ALLOWED" }, { status: 403 }),
    );
  }
  return applySecurityHeaders(
    new NextResponse("Forbidden: admin IP not allowlisted", { status: 403 }),
  );
}

export async function proxy(request: NextRequest) {
  const { pathname } = request.nextUrl;

  const ipDenied = denyAdminIp(request);
  if (ipDenied) return ipDenied;

  if (pathname.startsWith("/admin") && pathname !== "/admin/login") {
    if (!(await hasValidAdminSession(request))) {
      const login = new URL("/admin/login", request.url);
      login.searchParams.set("next", pathname);
      return applySecurityHeaders(NextResponse.redirect(login));
    }
  }

  if (pathname.startsWith("/api/admin") && !pathname.startsWith("/api/admin/login")) {
    if (!(await hasValidAdminSession(request))) {
      return applySecurityHeaders(
        NextResponse.json({ error: "Unauthorized" }, { status: 401 }),
      );
    }
  }

  return applySecurityHeaders(NextResponse.next());
}

export const config = {
  matcher: ["/((?!_next/static|_next/image|favicon.ico|uploads/).*)"],
};
