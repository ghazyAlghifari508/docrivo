import { fileURLToPath } from "node:url"
import { defineConfig } from "vite"
import viteReact from "@vitejs/plugin-react"
import { tanstackStart } from "@tanstack/react-start/plugin/vite"
import tailwindcss from "@tailwindcss/vite"

export default defineConfig({
  server: { port: 3000 },
  resolve: {
    // Mirrors `paths` in `tsconfig.json`. Vite does not read tsconfig paths, so
    // without this `~/styles/globals.css` and `~/auth/middleware` fail to
    // resolve at bundle time while still type-checking cleanly.
    alias: {
      "~": fileURLToPath(new URL("./src", import.meta.url)),
    },
  },
  plugins: [
    tailwindcss(),
    // Before `viteReact()`: the Start plugin transforms the entries the React
    // plugin would otherwise handle first.
    tanstackStart({
      // Test files live under `src/routes/**/__tests__/`, and the router reads
      // every file under `src/routes` as a route module. Without this the dev
      // server refuses to start on `http-routes.test.ts`. The convention keeps
      // route tests next to the routes they cover, which is worth more than
      // moving them; the alternative is a `-` filename prefix.
      routeFileIgnorePattern: "\.test\.[jt]sx?$",
    }),
    viteReact(),
  ],
})
