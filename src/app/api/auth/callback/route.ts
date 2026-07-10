import { NextResponse, type NextRequest } from "next/server";
import { createAuthActions } from "@insforge/sdk/ssr";

function safeNext(raw: string | null) {
  const next = raw ?? "/";
  return next.startsWith("/") && !next.startsWith("//") ? next : "/";
}

export async function GET(request: NextRequest) {
  const code = request.nextUrl.searchParams.get("insforge_code");
  const oauthError = request.nextUrl.searchParams.get("error");
  const next = safeNext(request.cookies.get("insforge_oauth_next")?.value ?? null);

  if (oauthError || !code) {
    return NextResponse.redirect(new URL("/login?error=oauth_failed", request.url));
  }

  const codeVerifier = request.cookies.get("insforge_code_verifier")?.value;
  if (!codeVerifier) {
    return NextResponse.redirect(new URL("/login?error=missing_verifier", request.url));
  }

  const response = NextResponse.redirect(new URL(next, request.url));
  const auth = createAuthActions({ requestCookies: request.cookies, responseCookies: response.cookies });
  const { data, error } = await auth.exchangeOAuthCode(code, codeVerifier);

  if (error || !data?.user) {
    return NextResponse.redirect(new URL("/login?error=exchange_failed", request.url));
  }

  response.cookies.delete("insforge_code_verifier");
  response.cookies.delete("insforge_oauth_next");
  return response;
}
