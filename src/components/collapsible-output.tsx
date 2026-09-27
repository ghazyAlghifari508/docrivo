"use client";

import { useId, useState, type ReactNode } from "react";
import { ArrowCounterClockwise, X } from "@phosphor-icons/react";

/**
 * A result panel that can be folded away, and folded back open.
 *
 * ## Why this exists
 *
 * A finished DESIGN.md or a scraped page fills the viewport, and there was no way
 * to get it out of the way without navigating away and losing your place. Three
 * components needed it, and three copies of the same `useState` plus the same
 * two buttons would drift apart within a week, so the behaviour lives here.
 *
 * ## What "closed" does and does not do
 *
 * Closing **unmounts the children**. It does not delete anything: the job and the
 * scrape live in PostgreSQL, and TanStack Query holds the response, so reopening
 * refetches what is actually stored rather than anything held in this component.
 * That is the distinction the request turned on -- the *view* state goes, the
 * *work* state stays, and a reopened panel shows the real current status rather
 * than a stale render from twenty minutes ago.
 *
 * The one thing that is genuinely lost is scroll position inside the panel, and
 * the browser's own scroll anchoring will not restore it for unmounted content.
 * That is the trade for not leaving a live sandboxed `srcdoc` iframe running
 * behind a collapsed panel.
 */
export function CollapsibleOutput({
  label,
  /** Shown on the folded bar, so the user knows what they are reopening. */
  summary,
  defaultOpen = true,
  children,
  className = "",
}: {
  label: string
  summary?: ReactNode
  defaultOpen?: boolean
  children: ReactNode
  className?: string
}) {
  const [open, setOpen] = useState(defaultOpen)
  const panelId = useId()

  if (!open) {
    return (
      <div
        className={`flex items-center justify-between gap-3 rounded-cards border border-ink/15 bg-cream px-4 py-3 ${className}`}
      >
        <div className="min-w-0">
          <p className="text-body-sm font-medium text-ink">{label}</p>
          {summary ? (
            <p className="truncate text-caption text-muted-gray">{summary}</p>
          ) : null}
        </div>
        <button
          type="button"
          onClick={() => setOpen(true)}
          aria-expanded={false}
          aria-controls={panelId}
          className="pressable inline-flex shrink-0 items-center gap-2 rounded-buttons border border-ink bg-paper-white px-3 py-2 text-body-sm font-medium text-ink shadow-hard"
        >
          <ArrowCounterClockwise size={16} weight="bold" aria-hidden="true" />
          Tampilkan lagi
        </button>
      </div>
    )
  }

  return (
    <div className={`relative ${className}`}>
      <button
        type="button"
        onClick={() => setOpen(false)}
        aria-expanded={true}
        aria-controls={panelId}
        className="pressable absolute right-3 top-3 z-20 inline-flex size-9 items-center justify-center rounded-buttons border border-ink bg-paper-white text-ink shadow-hard"
      >
        <X size={16} weight="bold" aria-hidden="true" />
        <span className="sr-only">Tutup {label}</span>
      </button>
      <div id={panelId}>{children}</div>
    </div>
  )
}
