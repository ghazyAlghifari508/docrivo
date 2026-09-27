"use client";

import { useNavigate, Link } from "@tanstack/react-router";
import { useCallback } from "react";
import {
  ArrowRight,
  GearSix,
  SignOut,
  UserCircle,
} from "@phosphor-icons/react";
import { signOut, useSession } from "~/auth/client";

const PUBLIC_NAV = [
  ["Home", "/"],
  ["Tentang", "/tentang"],
  ["Bantuan", "/bantuan"],
  ["FAQ", "/faq"],
];

const USER_NAV = [
  ["Home", "/"],
  ["History", "/history"],
  ["Template", "/template"],
  ["Pricing", "/pricing"],
];

/**
 * Props are unchanged (`surface` only).
 *
 * Behaviour change, and it is not optional. The deleted version was an async
 * server component that called `getUser()` from `src/lib/dal`, which Task 3.1
 * removed along with the whole InsForge data layer. The replacement reads the
 * session from `authClient` on the client instead, so the server-rendered HTML
 * shows the public nav and the user nav appears after hydration. That flash is
 * the price of not having a session query yet: Task 5.1 adds the TanStack Query
 * option factories and Task 7.3 moves session resolution into the root loader,
 * and at that point this hook is replaced by the loader's data and the flash
 * goes away. Do not "fix" it by re-adding a server-side session call here --
 * that is exactly the per-request session cost Task 7.3 exists to remove.
 */
export function SiteHeader({
  surface = "paper",
}: {
  surface?: "paper" | "cream" | "depth";
}) {
  const { data: session } = useSession();
  const navigate = useNavigate();
  const user = session?.user ?? null;
  const nav = user ? USER_NAV : PUBLIC_NAV;
  const dark = surface === "depth";
  const bg = dark
    ? "bg-depth text-paper-white"
    : surface === "cream"
      ? "bg-cream"
      : "bg-paper-white";
  const border = dark ? "border-paper-white/12" : "border-rule";

  // The Next version was a `<form action={signOut}>` posting to a server
  // action. There is no server action to post to any more, and `signOut` is
  // already exported from `src/auth/client.ts`, so the call moves to the click
  // handler. `signOut` is a promise, hence the `void`: the redirect is the
  // observable outcome and a rejection here is Better Auth's own to report.
  const handleSignOut = useCallback(async () => {
    await signOut()
    void navigate({ to: "/" })
  }, [navigate])

  return (
    <header className={`sticky top-0 z-40 border-b ${bg} ${border}`}>
      <a
        href="#main"
        className="sr-only focus:not-sr-only focus:absolute focus:left-4 focus:top-4 focus:z-50 focus:rounded-buttons focus:border focus:border-ink focus:bg-lime-sprint focus:px-4 focus:py-2 focus:text-body-sm focus:font-medium focus:text-ink"
      >
        Lewati ke konten utama
      </a>
      <div className="page-shell flex h-[67px] items-center justify-between gap-6">
        <Link
          to="/"
          className="flex shrink-0 items-center gap-2.5 text-body font-semibold tracking-[-0.02em]"
        >
          <span>Docrivo</span>
        </Link>

        <nav
          className={`hidden items-center gap-8 text-body-sm font-medium md:flex ${dark ? "text-paper-white/85" : "text-ink"}`}
        >
          {nav.map(([label, href]) => (
            <Link key={href} to={href} className="link-underline">
              {label}
            </Link>
          ))}
        </nav>

        <div className="flex shrink-0 items-center gap-4">
          {user ? (
            <details className="group relative">
              <summary className="pressable flex size-10 cursor-pointer list-none items-center justify-center rounded-buttons border border-ink bg-paper-white text-ink shadow-hard [&::-webkit-details-marker]:hidden">
                <span className="sr-only">Buka menu profil</span>
                <UserCircle size={22} weight="fill" aria-hidden="true" />
              </summary>
              <div className="absolute right-0 top-12 w-56 overflow-hidden rounded-cards border border-ink bg-paper-white text-ink shadow-hard-xl">
                <div className="border-b border-rule px-4 py-3">
                  <p className="truncate text-body-sm font-semibold">
                    {user.name ?? "Pengguna"}
                  </p>
                  <p className="truncate text-caption text-muted-gray">
                    {user.email}
                  </p>
                </div>
                <Link
                  to="/profile"
                  className="flex items-center gap-2 px-4 py-3 text-body-sm hover:bg-cream"
                >
                  <UserCircle size={16} weight="fill" aria-hidden="true" />{" "}
                  Profile
                </Link>
                <Link
                  to="/setting"
                  className="flex items-center gap-2 px-4 py-3 text-body-sm hover:bg-cream"
                >
                  <GearSix size={16} weight="fill" aria-hidden="true" /> Setting
                </Link>
                <button
                  type="button"
                  onClick={() => void handleSignOut()}
                  className="flex w-full items-center gap-2 border-t border-rule px-4 py-3 text-left text-body-sm hover:bg-cream"
                >
                  <SignOut size={16} weight="fill" aria-hidden="true" />{" "}
                  Keluar
                </button>
              </div>
            </details>
          ) : (
            <Link
              to="/login"
              className="pressable inline-flex h-10 items-center gap-2 rounded-buttons border border-ink bg-lime-sprint px-4 text-body-sm font-medium text-ink shadow-hard"
            >
              Masuk
              <ArrowRight size={16} weight="bold" aria-hidden="true" />
            </Link>
          )}
        </div>
      </div>
    </header>
  );
}
