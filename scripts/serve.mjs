/**
 * Production entry for the built TanStack Start server.
 *
 * `vite build` emits `dist/server/server.js` as a **fetch handler** -- it
 * exports `{ fetch }` and deliberately starts no listener, so
 * `node dist/server/server.js` exits 0 immediately having served nothing. This
 * file is the missing adapter: it binds a `node:http` server and forwards every
 * request into that handler, which is what `npm start` needs to mean.
 *
 * `node:http` rather than a framework because the handler already speaks
 * `Request`/`Response`; all this has to do is convert between the two
 * representations and stream the body both ways. Nothing is buffered, so an
 * SSE response and a large asset both stream rather than materialise in memory.
 */

import { createServer } from "node:http"
import { Readable } from "node:stream"
// The build emits a **default** export shaped `{ fetch }` -- not a named
// `handler`. `export { createServerEntry, server_default as default, ... }`.
// Importing a named `handler` here throws at module load, before the server
// ever listens, so the failure looks like a hang rather than a bad import.
import startHandler from "../dist/server/server.js"

const port = Number(process.env.PORT ?? 3000)
const host = process.env.HOST ?? "127.0.0.1"

const server = createServer(async (req, res) => {
  const url = `http://${req.headers.host ?? `${host}:${port}`}${req.url}`

  const hasBody = req.method !== "GET" && req.method !== "HEAD"

  const request = new Request(url, {
    method: req.method,
    headers: req.headers,
    body: hasBody ? Readable.toWeb(req) : undefined,
    // Node's IncomingMessage is a stream, and `fetch` needs `duplex` set when a
    // streaming body is passed. Without it undici throws before the handler
    // ever runs, which surfaces as a 500 on every POST.
    duplex: hasBody ? "half" : undefined,
  })

  try {
    const response = await startHandler.fetch(request)

    res.writeHead(response.status, Object.fromEntries(response.headers))

    if (response.body) {
      // `pipeTo` handles the backpressure; piping raw would buffer the whole
      // body in the Node side stream.
      await Readable.fromWeb(response.body).pipe(res)
    } else {
      res.end()
    }
  } catch (error) {
    // A throw here means the SSR pipeline failed. Log it, because without this
    // the client only ever sees a bare 500 with no explanation anywhere.
    console.error("[serve] handler threw:", error)
    if (!res.headersSent) {
      res.writeHead(500, { "Content-Type": "text/plain" })
    }
    res.end("Internal Server Error")
  }
})

server.listen(port, host, () => {
  console.log(`[serve] listening on http://${host}:${port}`)
})
