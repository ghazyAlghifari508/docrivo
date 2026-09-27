import { createFileRoute } from "@tanstack/react-router"
import { AboutPage } from "./about"

export const Route = createFileRoute("/tentang")({
  head: () => ({
    meta: [
      { title: "Tentang - Docrivo" },
      {
        name: "description",
        content:
          "Kenapa Docrivo ada: mengubah website referensi jadi DESIGN.md untuk AI coding assistant.",
      },
    ],
  }),
  // The Next page was `export default AboutPage` from `../about/page`, so the
  // two URLs rendered one component. Same here, imported from the sibling route
  // module rather than duplicated.
  component: AboutPage,
})
