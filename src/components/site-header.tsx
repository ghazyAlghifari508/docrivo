import Link from "next/link";
import {
  ArrowRight,
  GearSix,
  SignOut,
  UserCircle,
} from "@phosphor-icons/react/dist/ssr";
import { getUser } from "@/lib/dal";
import { signOut } from "@/lib/auth-actions";

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

export async function SiteHeader({
  surface = "paper",
}: {
  surface?: "paper" | "cream" | "depth";
}) {
  const user = await getUser();
  const nav = user ? USER_NAV : PUBLIC_NAV;
  const dark = surface === "depth";
  const bg = dark
    ? "bg-depth text-paper-white"
    : surface === "cream"
      ? "bg-cream"
      : "bg-paper-white";
  const border = dark ? "border-paper-white/12" : "border-rule";

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
          href="/"
          className="flex shrink-0 items-center gap-2.5 text-body font-semibold tracking-[-0.02em]"
        >
          <span>Docrivo</span>
        </Link>

        <nav
          className={`hidden items-center gap-8 text-body-sm font-medium md:flex ${dark ? "text-paper-white/85" : "text-ink"}`}
        >
          {nav.map(([label, href]) => (
            <Link key={href} href={href} className="link-underline">
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
                    {user.profile?.name ?? "Pengguna"}
                  </p>
                  <p className="truncate text-caption text-muted-gray">
                    {user.email}
                  </p>
                </div>
                <Link
                  href="/profile"
                  className="flex items-center gap-2 px-4 py-3 text-body-sm hover:bg-cream"
                >
                  <UserCircle size={16} weight="fill" aria-hidden="true" />{" "}
                  Profile
                </Link>
                <Link
                  href="/setting"
                  className="flex items-center gap-2 px-4 py-3 text-body-sm hover:bg-cream"
                >
                  <GearSix size={16} weight="fill" aria-hidden="true" /> Setting
                </Link>
                <form action={signOut}>
                  <button className="flex w-full items-center gap-2 border-t border-rule px-4 py-3 text-left text-body-sm hover:bg-cream">
                    <SignOut size={16} weight="fill" aria-hidden="true" />{" "}
                    Keluar
                  </button>
                </form>
              </div>
            </details>
          ) : (
            <Link
              href="/login"
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

function Wordmark({ dark }: { dark: boolean }) {
  return (
    <span
      className={`grid size-8 place-items-center rounded-buttons border bg-lime-sprint ${dark ? "border-paper-white" : "border-ink"}`}
      aria-hidden="true"
    >
      <svg
        width="20"
        height="14"
        viewBox="0 0 20 14"
        fill="none"
        className="text-ink"
      >
        <path
          d="M4 7C6.5 3 11 2.6 14 4C16.5 5 18 6.2 18.5 7C18 7.8 16.5 9 14 10C11 11.4 6.5 11 4 7Z"
          stroke="currentColor"
          strokeWidth="1.6"
          strokeLinejoin="round"
        />
        <path
          d="M4 7L1.5 4.2M4 7L1.5 9.8"
          stroke="currentColor"
          strokeWidth="1.6"
          strokeLinecap="round"
          strokeLinejoin="round"
        />
        <circle cx="14" cy="6.4" r="1" fill="currentColor" />
      </svg>
    </span>
  );
}
