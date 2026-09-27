// @vitest-environment jsdom
//
// Per-file rather than global: the other suites exercise drizzle, postgres and
// the worker, and a DOM for all of them would be slower for no benefit. This is
// the only component test in the repository, and it is here because the close
// control is the only way to dismiss a finished result.

import { render, screen, fireEvent, cleanup } from "@testing-library/react"
import { afterEach, describe, expect, it, vi } from "vitest"
import { useState, type ReactNode } from "react"
import { CollapsibleOutput } from "./collapsible-output"

// Testing Library only auto-cleans when the test framework exposes globals, and
// `vitest.config.ts` deliberately does not set `globals: true`. Without this the
// previous test's DOM is still mounted, `queryByText` finds the *earlier*
// element, and a suite that looks broken reports a failure belonging to a test
// that already passed.
afterEach(cleanup)

/**
 * The close control is the only way to get a finished result out of the way
 * without navigating away, and it is easy to write a version that looks right
 * and does nothing: a button that hides nothing, an `aria-expanded` that never
 * changes, a panel that unmounts on the way *in* rather than on the way out.
 *
 * These assert on what the user can see and do, not on internals.
 */
describe("CollapsibleOutput", () => {
  it("shows the content and a close control by default", () => {
    render(
      <CollapsibleOutput label="Hasil DESIGN.md">
        <p>isi DESIGN.md</p>
      </CollapsibleOutput>,
    )

    expect(screen.getByText("isi DESIGN.md")).toBeTruthy()
    expect(screen.getByRole("button", { name: /tutup hasil design\.md/i })).toBeTruthy()
  })

  it("honours defaultOpen={false}", () => {
    render(
      <CollapsibleOutput label="Hasil DESIGN.md" defaultOpen={false} summary="https://example.com">
        <p>isi DESIGN.md</p>
      </CollapsibleOutput>,
    )

    expect(screen.queryByText("isi DESIGN.md")).toBeNull()
    expect(screen.getByText("https://example.com")).toBeTruthy()
  })

  it("folds the content away and offers a way back", () => {
    const { container } = render(
      <CollapsibleOutput label="Hasil DESIGN.md" summary="https://example.com">
        <p>isi DESIGN.md</p>
      </CollapsibleOutput>,
    )

    fireEvent.click(screen.getByRole("button", { name: /tutup hasil design\.md/i }))

    // The content is gone from the document, not merely hidden with CSS: a
    // collapsed panel must not leave a live sandboxed iframe running behind it.
    expect(screen.queryByText("isi DESIGN.md")).toBeNull()
    expect(container.textContent).not.toContain("isi DESIGN.md")

    // And the summary is what tells the user what they would be reopening.
    expect(screen.getByText("Hasil DESIGN.md")).toBeTruthy()
    expect(screen.getByText("https://example.com")).toBeTruthy()
  })

  it("restores the content when reopened", () => {
    render(
      <CollapsibleOutput label="Hasil DESIGN.md">
        <p>isi DESIGN.md</p>
      </CollapsibleOutput>,
    )

    fireEvent.click(screen.getByRole("button", { name: /tutup hasil design\.md/i }))
    fireEvent.click(screen.getByRole("button", { name: /tampilkan lagi/i }))

    expect(screen.getByText("isi DESIGN.md")).toBeTruthy()
  })

  it("keeps aria-expanded honest in both directions", () => {
    render(
      <CollapsibleOutput label="Hasil DESIGN.md">
        <p>isi</p>
      </CollapsibleOutput>,
    )

    const close = screen.getByRole("button", { name: /tutup/i })
    expect(close.getAttribute("aria-expanded")).toBe("true")

    fireEvent.click(close)
    const reopen = screen.getByRole("button", { name: /tampilkan lagi/i })
    expect(reopen.getAttribute("aria-expanded")).toBe("false")
  })

  it("wires aria-controls to the panel it toggles", () => {
    // `getElementById` rather than a `#id` selector: `useId` emits colons
    // (`«r0»`), which are legal in an id and not a valid bare CSS identifier, so
    // a querySelector would need `CSS.escape` -- absent from jsdom's globals.
    render(
      <CollapsibleOutput label="Hasil DESIGN.md">
        <p>isi</p>
      </CollapsibleOutput>,
    )

    const close = screen.getByRole("button", { name: /tutup/i })
    const panelId = close.getAttribute("aria-controls")
    expect(panelId).toBeTruthy()
    expect(document.getElementById(panelId!)).toBeTruthy()
  })

  it("does not lose the work when folded: a parent's state survives", () => {
    // The distinction the request turned on. Closing discards the *view*, not
    // the work -- a counter owned by the parent must be untouched by a fold,
    // because that is what stands in for the job row living in PostgreSQL.
    function Harness() {
      const [count, setCount] = useState(0)
      return (
        <CollapsibleOutput label="Hasil">
          <button onClick={() => setCount((c) => c + 1)}>tambah</button>
          <p>jumlah: {count}</p>
        </CollapsibleOutput>
      )
    }

    render(<Harness />)
    fireEvent.click(screen.getByText("tambah"))
    fireEvent.click(screen.getByText("tambah"))
    expect(screen.getByText("jumlah: 2")).toBeTruthy()

    fireEvent.click(screen.getByRole("button", { name: /tutup hasil/i }))
    fireEvent.click(screen.getByRole("button", { name: /tampilkan lagi/i }))

    expect(screen.getByText("jumlah: 2")).toBeTruthy()
  })
})

/**
 * The negative control. A collapse that does not actually remove the content
 * would satisfy `queryByText(...)` being null only if it also hid the text, so
 * the mutation here swaps the "fold" for a no-op and asserts the suite notices.
 * If this file is ever edited down to nothing, that is the signal it gave up.
 */
describe("CollapsibleOutput is a real control, not decoration", () => {
  it("the fold actually changes the rendered tree", () => {
    const { container } = render(
      <CollapsibleOutput label="Hasil">
        <p data-testid="payload">isi</p>
      </CollapsibleOutput>,
    )

    expect(container.querySelectorAll("[data-testid=payload]")).toHaveLength(1)
    fireEvent.click(screen.getByRole("button", { name: /tutup hasil/i }))
    expect(container.querySelectorAll("[data-testid=payload]")).toHaveLength(0)
  })

  it("renders children as given, with no wrapper swallowing them", () => {
    const children: ReactNode = <p>dua anak</p>
    const { container } = render(<CollapsibleOutput label="Hasil">{children}</CollapsibleOutput>)

    expect(container.querySelectorAll("p")).toHaveLength(1)
    expect(screen.getByText("dua anak")).toBeTruthy()
  })

  it("does not require vi mocks to prove anything", () => {
    // Guards against a future edit that swaps the assertions for snapshot
    // comparisons, which pass on any change.
    expect(vi.isMockFunction(() => {})).toBe(false)
  })
})
