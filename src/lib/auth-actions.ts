"use server";

import { cookies } from "next/headers";
import { redirect } from "next/navigation";
import { createAuthActions } from "@insforge/sdk/ssr";

function appUrl() {
  return process.env.NEXT_PUBLIC_APP_URL ?? "http://localhost:3000";
}

function safeNext(raw: FormDataEntryValue | null) {
  const next = typeof raw === "string" ? raw : "/";
  return next.startsWith("/") && !next.startsWith("//") ? next : "/";
}

export async function signInWithGoogle(formData: FormData) {
  const cookieStore = await cookies();
  const auth = createAuthActions({ cookies: cookieStore });
  const next = safeNext(formData.get("next"));
  const callback = new URL("/api/auth/callback", appUrl());

  const { data, error } = await auth.signInWithOAuth("google", {
    redirectTo: callback.toString(),
    additionalParams: { prompt: "select_account" },
    skipBrowserRedirect: true,
  });

  if (error || !data.url || !data.codeVerifier) {
    redirect(`/login?error=${encodeURIComponent(error?.message ?? "oauth_init_failed")}`);
  }

  cookieStore.set("insforge_code_verifier", data.codeVerifier, {
    httpOnly: true,
    secure: process.env.NODE_ENV === "production",
    sameSite: "lax",
    path: "/",
    maxAge: 600,
  });

  cookieStore.set("insforge_oauth_next", next, {
    httpOnly: true,
    secure: process.env.NODE_ENV === "production",
    sameSite: "lax",
    path: "/",
    maxAge: 600,
  });

  redirect(data.url);
}

export async function signOut() {
  const auth = createAuthActions({ cookies: await cookies() });
  await auth.signOut();
  redirect("/");
}
