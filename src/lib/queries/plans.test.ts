import { describe, expect, it } from "vitest"
import { plansQueryOptions } from "./plans"

describe("plansQueryOptions", () => {
  it("does not poll", () => {
    // The plan catalogue is four rows of reference data that change when a plan
    // is edited, not while a user watches the page.
    expect(plansQueryOptions().refetchInterval).toBe(false)
  })

  it("uses one shared key, so every reader hits the same cache entry", () => {
    // The opposite of the per-id factories: there is one catalogue, so a
    // per-caller key would give each of the five routes its own copy of the
    // same four rows.
    expect(plansQueryOptions().queryKey).toEqual(["plans"])
    expect(plansQueryOptions().queryKey).toEqual(plansQueryOptions().queryKey)
  })

  it("holds the catalogue for a minute", () => {
    // Reference data, so a minute of staleness is free -- and it stops a route
    // change from re-reading `public.list_plans()` on every navigation.
    expect(plansQueryOptions().staleTime).toBe(60_000)
  })
})
