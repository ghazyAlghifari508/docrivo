import { Link } from "@tanstack/react-router"
import type { ErrorComponentProps, NotFoundRouteProps } from "@tanstack/react-router"
import { Warning } from "@phosphor-icons/react"
import { describeRouteError } from "~/lib/errors"

/**
 * Route-level error and not-found boundaries.
 *
 * The Next.js application had no `error.tsx`, `not-found.tsx` or `loading.tsx`,
 * so this closes a real gap rather than porting an absence forward. Six routes
 * can realistically fail -- a missing job id, a Midtrans lookup that timed out,
 * a database timeout -- and without a boundary each of those took down the whole
 * document with an unhandled rejection instead of a page the user can leave.
 *
 * The brief for this file called `createErrorComponent` from
 * `@tanstack/react-router`. That helper does not exist in
 * `@tanstack/react-router@1.170.39`: a route takes `errorComponent` and
 * `notFoundComponent` directly, and the props are `ErrorComponentProps` and
 * `NotFoundRouteProps`. The two exports below are the same components that
 * factory would have produced.
 *
 * The error message is rendered, not the stack, and only for the codes this app
 * raises on purpose. A `Response` thrown by `requireUser` -- a 401 -- has no
 * useful `message`, so it is described rather than printed.
 */
export function RouteError({ error, reset }: ErrorComponentProps) {
  return (
    <main
      id="main"
      className="grid min-h-[calc(100dvh-67px)] place-items-center bg-paper-white px-6"
    >
      <div className="max-w-sm text-center">
        <span className="mx-auto grid size-12 place-items-center rounded-buttons border border-ink bg-cream shadow-hard">
          <Warning size={22} weight="fill" aria-hidden="true" />
        </span>
        <h1 className="mt-6 text-heading-sm font-semibold tracking-heading-sm">
          Terjadi kesalahan
        </h1>
        {/* The sentence comes from `describeRouteError`, which lives in
            `src/lib/errors.ts` so it can be tested without rendering. */}
        <p className="mt-3 text-body-sm leading-7 text-muted">
          {describeRouteError(error)}
        </p>
        <div className="mt-7 flex flex-wrap items-center justify-center gap-3">
          <button
            type="button"
            onClick={reset}
            className="pressable inline-flex h-11 items-center gap-2 rounded-buttons border border-ink bg-lime-sprint px-5 text-body-sm font-medium text-ink shadow-hard"
          >
            Coba lagi
          </button>
          <Link
            to="/"
            className="pressable inline-flex h-11 items-center gap-2 rounded-buttons border border-ink bg-paper-white px-5 text-body-sm font-medium text-ink shadow-hard"
          >
            Kembali ke beranda
          </Link>
        </div>
      </div>
    </main>
  )
}

/**
 * What the router renders for `notFound()` and for a URL that matches no route.
 *
 * It says the page does not exist and nothing else. It must not distinguish "you
 * are not allowed" from "there is nothing here" -- the ownership rule in
 * `src/queries/jobs.ts` raises `notFound()` for both, and a boundary that gave
 * the second one a different message would undo that.
 */
export function RouteNotFound(_props: NotFoundRouteProps) {
  return (
    <main
      id="main"
      className="grid min-h-[calc(100dvh-67px)] place-items-center bg-paper-white px-6"
    >
      <div className="max-w-sm text-center">
        <span className="text-caption font-semibold uppercase tracking-[0.08em] text-muted-gray">
          404
        </span>
        <h1 className="mt-3 text-heading-sm font-semibold tracking-heading-sm">
          Halaman tidak ditemukan
        </h1>
        <p className="mt-3 text-body-sm leading-7 text-muted">
          Alamat yang kamu buka tidak ada, atau sudah tidak tersedia.
        </p>
        <Link
          to="/"
          className="pressable mt-7 inline-flex h-11 items-center gap-2 rounded-buttons border border-ink bg-lime-sprint px-5 text-body-sm font-medium text-ink shadow-hard"
        >
          Kembali ke beranda
        </Link>
      </div>
    </main>
  )
}

/**
 * A user-facing sentence for whatever reached the boundary is chosen by
 * `describeRouteError` in `src/lib/errors.ts`. It is there rather than inline so
 * it can be tested without a DOM: this suite runs in the `node` environment and
 * rendering React is not something it can do.
 */
