import { createRouter } from "@tanstack/react-router"
import { routeTree } from "./routeTree.gen"

// A required entry: the Start plugin resolves the router entry with
// `required: true` and throws "Could not resolve entry for router entry" at
// config time without it. The `Register` augmentation that types `routeTree.gen`
// is emitted into the generated file itself, so nothing is declared here.
export function getRouter() {
  return createRouter({
    routeTree,
    defaultPreload: "intent",
    scrollRestoration: true,
  })
}
