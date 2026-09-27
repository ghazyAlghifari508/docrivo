import { QueryClient, QueryClientProvider } from "@tanstack/react-query"
import { HeadContent, createRootRoute, Scripts } from "@tanstack/react-router"
import { useState, type ReactNode } from "react"
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
