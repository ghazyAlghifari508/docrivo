import { describe, expect, it } from "vitest"
import { readFileSync } from "node:fs"
import { fileURLToPath } from "node:url"

/**
 * A source-level assertion is the honest test for this task. What these three
 * components do is "poll until the job reaches a terminal status", and after
 * Task 5.1 that decision belongs to a query factory, not to the component. A
 * render test could only prove the component still draws; it cannot prove the
 * interval, the `AbortController` and the `alive` flag are gone, and those are
 * exactly the things that creep back.
 *
 * The paths are resolved from this file rather than from the working directory,
 * so a `readFileSync` that found nothing could not be mistaken for a pass. It
 * throws on a missing path, which is the failure mode worth having: a component
 * renamed out from under the list turns this red instead of silently exempt.
 */
const read = (relative: string) =>
  readFileSync(fileURLToPath(new URL(relative, import.meta.url)), "utf8")

const SOURCES = [
  "../generation-result.tsx",
  "../history-list.tsx",
  "../scrape-detail.tsx",
]

/**
 * The two that used to own an interval, each with the factory it must reach for
 * and the server function it must not. `history-list` never had a poll; it takes
 * its rows from a route loader and is here only to prove it stays that way.
 */
const FETCHERS = [
  { file: "../generation-result.tsx", factory: "jobQueryOptions", serverFn: "getOwnedJob" },
  { file: "../scrape-detail.tsx", factory: "scrapeQueryOptions", serverFn: "getScrape" },
]

describe("polling components", () => {
  it("contain no manual AbortController", () => {
    for (const file of SOURCES) {
      expect(read(file), file).not.toContain("AbortController")
    }
  })

  it("contain no manual setInterval", () => {
    for (const file of SOURCES) {
      expect(read(file), file).not.toMatch(/setInterval/)
    }
  })

  it("fetch through a query factory rather than calling a server function", () => {
    for (const { file, factory, serverFn } of FETCHERS) {
      const source = read(file)
      // The factory is what `useQuery` is handed, not just anything: a component
      // that reached for `useQuery({ queryKey, queryFn: ... })` directly would be
      // rebuilding the options under component lifecycle, which is the thing
      // this task moved out.
      expect(source, file).toMatch(new RegExp(`useQuery\\(\\s*${factory}\\b`))
      // Reaching for the server function again would put the fetch back inside an
      // effect, which is what the factory replaced.
      expect(source, file).not.toMatch(new RegExp(`\\b${serverFn}\\b`))
    }
  })

  it("keeps generation-result free of effects and refs entirely", () => {
    // The only reason this component had an effect was the poll. The ETA estimate
    // it also held came from a three-sample `useRef` window fed by that same poll,
    // so with the poll gone both are gone -- and what remains is a `useState` for
    // the copy button and a query. An effect creeping back into this file means
    // somebody is rebuilding a lifecycle that the cache now owns.
    const source = read("../generation-result.tsx")
    expect(source).not.toMatch(/\buseEffect\b/)
    expect(source).not.toMatch(/\buseRef\b/)
  })

  it("takes the terminal status list from the factory, not a local copy", () => {
    // The component still needs to know whether the job ended -- it decides what
    // to draw. But the list of statuses that count as ended lives in
    // `jobQueryOptions`, and a second copy here is a second thing to forget: add a
    // status to one and the progress bar keeps polling or stops early. The
    // pattern is an array literal opening with "completed", which is what both
    // copies looked like. `STATUS_LABEL` is a label table, not a status list, and
    // its unquoted keys do not match.
    const source = read("../generation-result.tsx")
    expect(source).toMatch(/\bisTerminalJobStatus\b/)
    expect(source).not.toMatch(/\[\s*"completed"/)
  })

  it("drops the dead collapse branch from generation-result", () => {
    // `const collapsed = false` with a `!collapsed &&` guard around two thirds of
    // the tree. The toggle was never wired, so the guard was always taken and the
    // markup was unreachable.
    const source = read("../generation-result.tsx")
    expect(source).not.toMatch(/collapsed/)
  })
})
