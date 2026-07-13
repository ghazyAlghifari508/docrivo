import { NextResponse, type NextRequest } from "next/server";
import { updateSession, type CookieStore } from "@insforge/sdk/ssr/middleware";

type ReadonlyCookies = Pick<CookieStore, "get">;

const AUTH_ONLY = ["/history", "/generations", "/template", "/profile", "/setting", "/admin"];
const AUTH_APIS = ["/api/generations", "/api/scrape"];
const PUBLIC_WHEN_OUT = ["/login"];

function starts(path: string, prefixes: string[]) {
  return prefixes.some((prefix) => path === prefix || path.startsWith(`${prefix}/`));
}

/** Check whether a JWT is structurally expired by inspecting its payload's
 * `exp` claim. No network I/O, no signature verification — only rejects tokens
 * that are obviously stale so we don't burn 30s waiting for updateSession on a
 * dead session. A valid JWT still has to clear updateSession for full auth.
 * Returns the raw token string or null. */
function hasLiveToken(cookies: ReadonlyCookies): string | null {
  const cookie = cookies.get("insforge_access_token");
  if (!cookie) return null;
  const raw = typeof cookie === "string" ? cookie : cookie.value ?? null;
  if (!raw) return null;
  try {
    const payload = JSON.parse(Buffer.from(raw.split(".")[1]!, "base64url").toString());
    if (payload.exp && payload.exp * 1000 < Date.now()) return null;
  } catch {
    return null;
  }
  return raw;
}

export async function proxy(request: NextRequest) {
  const response = NextResponse.next({ request });
  const path = request.nextUrl.pathname;
  let authed = false;

  // Fast local JWT check first — no network I/O. updateSession still runs
  // for refresh-token rotation, but we short-circuit the 30s timeout.
  const localToken = hasLiveToken(request.cookies as unknown as ReadonlyCookies);
  if (localToken) {
    authed = true;
  } else {
    // No live local token — try SDK refresh (with a tight deadline since
    // InsForge can be slow under load on nano). If it times out, treat
    // as unauthenticated rather than blocking the page for 30s.
    try {
      const session = await updateSession({
        requestCookies: request.cookies as unknown as ReadonlyCookies,
        responseCookies: response.cookies,
      });
      authed = Boolean(session.accessToken);
    } catch {
      authed = false;
    }
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
