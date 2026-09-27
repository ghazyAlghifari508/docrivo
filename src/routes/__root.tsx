import { QueryClient, QueryClientProvider } from "@tanstack/react-query"
import { HeadContent, createRootRoute, Scripts } from "@tanstack/react-router"
import { useState, type ReactNode } from "react"
import { RouteError, RouteNotFound } from "~/components/route-error"
import { getSession } from "~/auth/middleware"
import globalCss from "~/styles/globals.css?url"

export const Route = createRootRoute({
  head: () => ({
    meta: [
      { charSet: "utf-8" },
      { name: "viewport", content: "width=device-width, initial-scale=1" },
      { title: "Docrivo" },
    ],
    links: [{ rel: "stylesheet", href: globalCss }],
  }),
  /**
   * The one place in the application that resolves a session.
   *
   * `beforeLoad`, not `loader`, and the distinction is load-bearing rather than
   * stylistic. Read out of the installed `router-core/dist/esm/load-client.js`,
   * `contextualize()` builds each match's context from the **parent's context**
   * and then merges that match's own `beforeLoad` result into it. A parent's
   * **loader data** is not in that chain: `getLoaderContext()` passes
   * `context: match.context`, which by then holds the parent's route context and
   * beforeLoad results and nothing else. So a session returned from a root
   * *loader* would be invisible to a child's `beforeLoad`, and every guard would
   * have to resolve the session again -- reintroducing the per-request cost this
   * task exists to remove. A `beforeLoad` result is inherited by all descendants
   * for free.
   *
   * `getSession()` is a server function, which is what makes the guard work on an
   * in-app navigation and not only on a full page load: Start invokes server
   * functions in-process during SSR and over RPC on the client, so the same call
   * serves both. A direct `getRequestHeaders()` here would be a
   * `@tanstack/react-start/server` import in the client graph, which the Start
   * plugin refuses -- and the session would then exist only on the server, which
   * is the exact guard that looks like a guard and is not one.
   *
   * The `session` key is the contract with `src/auth/guard.ts`. A rename on
   * either side leaves every guard reading `undefined`, which is indistinguishable
   * from "signed out" -- every protected page would redirect and no test of a
   * guard itself would notice.
   */
  beforeLoad: async () => ({ session: await getSession() }),
  // On the root rather than per route, so it covers the case the six per-route
  // boundaries cannot: a URL that matches no route at all. Every route inherits
  // these two unless it declares its own, which is why the individual routes
  // name them explicitly -- a route that opts out silently would be a decision
  // nobody made.
  errorComponent: RouteError,
  notFoundComponent: RouteNotFound,
  // `shellComponent`, not `component`: the shell renders `<html>` and
  // `<body>`, which must sit outside the router's own outlet.
  shellComponent: RootDocument,
})

function RootDocument({ children }: { children: ReactNode }) {
  // Per-render, not a module-level constant. A module-level QueryClient is
  // shared across requests on the server, so one visitor's cache would be
  // serialised into another visitor's response.
  const [queryClient] = useState(() => new QueryClient())
  return (
    <QueryClientProvider client={queryClient}>
      <html lang="id">
        <head>
          <HeadContent />
        </head>
        <body>
          {children}
          <Scripts />
        </body>
      </html>
    </QueryClientProvider>
  )
}
