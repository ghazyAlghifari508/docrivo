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
    // No `routeFileIgnorePattern` here: this version does not accept it on
    // `tanstackStart()`, and passing it was a type error. The router's own
    // `routeFileIgnorePrefix` ("-") is what the route test files use instead.
    tanstackStart(),
    viteReact(),
  ],
})
