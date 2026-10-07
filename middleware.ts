import { NextResponse } from "next/server";
import type { NextRequest } from "next/server";

const rateLimits = new Map<
  string,
  { count: number; resetAt: number; blocked: boolean }
>();

setInterval(() => {
  const now = Date.now();
  for (const [key, limit] of rateLimits.entries()) {
    if (now > limit.resetAt + 300000) {
      rateLimits.delete(key);
    }
  }
}, 300000);

export function middleware(request: NextRequest) {
  const pathname = request.nextUrl.pathname;

  if (
    pathname.startsWith("/_next") ||
    pathname.startsWith("/static") ||
    pathname === "/api/health"
  ) {
    return NextResponse.next();
  }

  const ip =
    request.headers.get("x-forwarded-for")?.split(",")[0]?.trim() ??
    request.headers.get("x-real-ip") ??
    "unknown";

  const key = `${ip}:${pathname}`;
  const now = Date.now();
  const limit = rateLimits.get(key);

  const isWrite =
    (pathname.includes("/claim") ||
      pathname.includes("/finish") ||
      pathname.includes("/voucher") ||
      pathname === "/api/runs") &&
    request.method !== "GET";

  const maxRequests = isWrite ? 30 : 60;
  const windowMs = 60000;

  if (limit) {
    if (now < limit.resetAt) {
      if (limit.blocked) {
        return NextResponse.json(
          {
            error: "Rate limit exceeded",
            retryAfter: Math.ceil((limit.resetAt - now) / 1000),
          },
          {
            status: 429,
            headers: {
              "Retry-After": String(Math.ceil((limit.resetAt - now) / 1000)),
            },
          },
        );
      }

      if (limit.count >= maxRequests) {
        limit.blocked = true;
        return NextResponse.json(
          {
            error: "Rate limit exceeded",
            retryAfter: Math.ceil((limit.resetAt - now) / 1000),
          },
          {
            status: 429,
            headers: {
              "Retry-After": String(Math.ceil((limit.resetAt - now) / 1000)),
            },
          },
        );
      }

      limit.count++;
    } else {
      rateLimits.set(key, { count: 1, resetAt: now + windowMs, blocked: false });
    }
  } else {
    rateLimits.set(key, { count: 1, resetAt: now + windowMs, blocked: false });
  }

  const response = NextResponse.next();
  const current = rateLimits.get(key);
  if (current) {
    response.headers.set("X-RateLimit-Limit", String(maxRequests));
    response.headers.set("X-RateLimit-Remaining", String(maxRequests - current.count));
    response.headers.set("X-RateLimit-Reset", String(current.resetAt));
  }

  return response;
}

export const config = {
  matcher: "/api/:path*",
};
