import { NextResponse, type NextRequest } from "next/server";
import { updateSession, type CookieStore } from "@insforge/sdk/ssr/middleware";

type ReadonlyCookies = Pick<CookieStore, "get">;

const AUTH_ONLY = ["/history", "/generations", "/template", "/profile", "/setting", "/admin"];
const AUTH_APIS = ["/api/generations", "/api/scrape"];
const PUBLIC_WHEN_OUT = ["/login"];

function starts(path: string, prefixes: string[]) {
  return prefixes.some((prefix) => path === prefix || path.startsWith(`${prefix}/`));
}

export async function proxy(request: NextRequest) {
  const response = NextResponse.next({ request });
  const path = request.nextUrl.pathname;
  let authed = false;

  try {
    const session = await updateSession({
      requestCookies: request.cookies as unknown as ReadonlyCookies,
      responseCookies: response.cookies,
    });
    authed = Boolean(session.accessToken);
  } catch {
    authed = false;
  }

  if (starts(path, AUTH_ONLY) && !authed) {
    const login = new URL("/login", request.url);
    login.searchParams.set("next", path);
    return NextResponse.redirect(login);
  }

  if (starts(path, AUTH_APIS) && !authed) {
    return NextResponse.json({ error: { code: "UNAUTHORIZED", message: "Masuk dengan Google dulu." } }, { status: 401 });
  }

  if (starts(path, PUBLIC_WHEN_OUT) && authed) {
    return NextResponse.redirect(new URL("/", request.url));
  }

  return response;
}

export const config = {
  matcher: ["/((?!_next/static|_next/image|favicon.ico).*)"],
};
