import { NextResponse, type NextRequest } from "next/server";

export function middleware(req: NextRequest) {
  if (!req.nextUrl.pathname.startsWith("/admin")) return NextResponse.next();

  const expected = process.env.ADMIN_TOKEN;
  // ponytail: local MVP guard. Set ADMIN_TOKEN before exposing /admin anywhere public.
  if (!expected) {
    return new NextResponse("Admin disabled. Set ADMIN_TOKEN.", { status: 403 });
  }

  const auth = req.headers.get("authorization");
  const got = auth?.startsWith("Bearer ") ? auth.slice(7) : req.headers.get("x-admin-token");
  if (got !== expected) return new NextResponse("Unauthorized", { status: 401 });
  return NextResponse.next();
}

export const config = { matcher: ["/admin/:path*"] };
