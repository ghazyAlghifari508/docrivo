import { createFileRoute } from "@tanstack/react-router"
import { GoogleLogo } from "@phosphor-icons/react"
import { SiteHeader } from "~/components/site-header"
import { SiteFooter } from "~/components/site-footer"
import { authClient } from "~/auth/client"
import { safeNext } from "~/auth/redirect"

/**
 * Where a signed-out visitor lands when `next` is absent or unusable.
 *
 * Named rather than inlined so the call-site test can assert against it instead
 * of against a literal that a later edit can drift from.
 */
export const DEFAULT_LOGIN_DESTINATION = "/"

/**
 * The destination the "Masuk dengan Google" button hands to Better Auth.
 *
 * `safeNext` returns `null` both for a missing `?next=` and for a rejected one,
 * and the two are deliberately indistinguishable here: an attacker must not be
 * able to tell "no next param" from "next was rejected". The consequence is
 * that the `null` branch below is a *product* decision, not a safety one, and it
 * has to be explicit. If this function ever quietly falls back to some other
 * destination, the guard is bypassed at the call site and nothing in
 * `src/auth/redirect.ts` catches it -- that is what
 * `src/routes/__tests__/login-redirect.test.ts` exists to catch.
 *
 * Exported so the test can assert the *resolved destination* rather than the
 * absence of a throw. A function that "rejects" by crashing satisfies a
 * `toThrow()` assertion while still sending the user somewhere wrong.
 */
export function resolveLoginDestination(search: {
  next?: string | null
}): string {
  return (
    safeNext(typeof search.next === "string" ? search.next : null) ??
    DEFAULT_LOGIN_DESTINATION
  )
}

export const Route = createFileRoute("/login")({
  // TODO(Task 7.3): the deleted page redirected an already-signed-in visitor to
  // `/`. That needs the root loader's session; the `beforeLoad` guard belongs
  // there rather than here, so /login currently renders for signed-in users too.
  // `safeNext` runs in `validateSearch` rather than at the call to
  // `authClient.signIn.social`, so a malicious `?next=` is discarded before it
  // can reach the OAuth callback URL. This is the defence the InsForge-era
  // `safeNext()` provided.
  //
  // `next` is omitted from the returned object rather than set to `null` when
  // the guard rejects. Same outcome -- `resolveLoginDestination` treats an
  // absent key and an explicit `null` identically, and both mean the default --
  // but an optional key keeps `search` off the three `Link to="/login"` call
  // sites, which TanStack would otherwise force to pass `search={{ next: null }}`.
  validateSearch: (
    search: Record<string, unknown>,
  ): { next?: string; error?: string } => {
    const next = safeNext(typeof search.next === "string" ? search.next : null)
    const error = typeof search.error === "string" ? search.error : undefined
    return {
      ...(next === null ? {} : { next }),
      ...(error === undefined ? {} : { error }),
    }
  },
  head: () => ({
    meta: [
      { title: "Masuk - Docrivo" },
      { name: "description", content: "Masuk ke Docrivo dengan Google." },
    ],
  }),
  component: LoginPage,
})

function LoginPage() {
  const { next, error } = Route.useSearch()
  // Explicit branch, because `null` means both "no next" and "next rejected".
  const destination = resolveLoginDestination({ next })

  async function signInWithGoogle() {
    await authClient.signIn.social({
      provider: "google",
      callbackURL: destination,
    })
  }

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
            Gunakan akun Google Anda untuk mengakses Docrivo dan mulai membuat DESIGN.md.
          </p>
          {error ? (
            <p role="alert" className="mt-4 rounded-buttons border border-red-300 bg-red-50 px-4 py-3 text-caption font-medium text-red-700">
              Login gagal. Coba ulangi.
            </p>
          ) : null}
          <button
            type="button"
            onClick={() => void signInWithGoogle()}
            className="pressable mt-7 inline-flex h-12 w-full items-center justify-center gap-2 rounded-buttons border border-ink bg-lime-sprint px-5 text-body-sm font-medium text-ink shadow-hard"
          >
            <GoogleLogo size={19} weight="fill" aria-hidden="true" />
            Masuk dengan Google
          </button>
        </section>
      </main>
      <SiteFooter />
    </>
  )
}
