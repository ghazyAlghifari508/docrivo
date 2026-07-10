import type { Metadata } from "next";
import { GoogleLogo } from "@phosphor-icons/react/dist/ssr";
import { SiteHeader } from "@/components/site-header";
import { SiteFooter } from "@/components/site-footer";
import { signInWithGoogle } from "@/lib/auth-actions";

export const metadata: Metadata = {
  title: "Masuk - Docrivo",
  description: "Masuk ke Docrivo dengan Google.",
};

export default async function LoginPage({ searchParams }: { searchParams: Promise<{ next?: string; error?: string }> }) {
  const params = await searchParams;
  const next = params.next && params.next.startsWith("/") && !params.next.startsWith("//") ? params.next : "/";

  return (
    <>
      <SiteHeader />
      <main id="main" className="grid min-h-[calc(100dvh-67px)] place-items-center bg-paper-white px-4 py-16">
        <section className="w-full max-w-md rounded-cards border border-ink bg-cream p-8 text-center shadow-hard-xl">
          <span className="text-caption font-semibold uppercase tracking-[0.08em] text-muted-gray">Login</span>
          <h1 className="mt-3 text-heading font-semibold leading-heading tracking-heading">
            Masuk dengan <span className="emph">Google</span>.
          </h1>
          <p className="mt-4 text-body-sm leading-7 text-muted">
            Tidak ada register, username, atau password. Cukup pakai akun Google.
          </p>
          {params.error ? (
            <p role="alert" className="mt-4 rounded-buttons border border-red-300 bg-red-50 px-4 py-3 text-caption font-medium text-red-700">
              Login gagal. Coba ulangi.
            </p>
          ) : null}
          <form action={signInWithGoogle} className="mt-7">
            <input type="hidden" name="next" value={next} />
            <button className="pressable inline-flex h-12 w-full items-center justify-center gap-2 rounded-buttons border border-ink bg-lime-sprint px-5 text-body-sm font-medium text-ink shadow-hard">
              <GoogleLogo size={19} weight="fill" aria-hidden="true" />
              Masuk dengan Google
            </button>
          </form>
        </section>
      </main>
      <SiteFooter />
    </>
  );
}
