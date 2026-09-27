"use client";

import { useState, type KeyboardEvent } from "react";
import { FileMd, Code } from "@phosphor-icons/react";
import { GenerationForm } from "./generation-form";
import { HtmlScraper } from "./html-scraper";
import { UpgradeModal } from "./upgrade-modal";

type Tab = "design" | "scrape";

export function HomeGenerator({
  authed,
  remainingDesign,
  remainingScrape,
}: {
  authed: boolean;
  remainingDesign: number | null;
  remainingScrape: number | null;
}) {
  const [tab, setTab] = useState<Tab>("design");
  const [quotaOpen, setQuotaOpen] = useState(false);

  // Optimistic local credit: track successes this session, derive display during
  // render. Reset both counters when the server reports a new remaining count —
  // done in render (store-previous-prop pattern) so there's no effect/flicker.
  const [designSpent, setDesignSpent] = useState(0);
  const [scrapeSpent, setScrapeSpent] = useState(0);
  const [prevRemaining, setPrevRemaining] = useState({ design: remainingDesign, scrape: remainingScrape });
  if (prevRemaining.design !== remainingDesign || prevRemaining.scrape !== remainingScrape) {
    setPrevRemaining({ design: remainingDesign, scrape: remainingScrape });
    setDesignSpent(0);
    setScrapeSpent(0);
  }
  const design = remainingDesign == null ? null : Math.max(0, remainingDesign - designSpent);
  const scrape = remainingScrape == null ? null : Math.max(0, remainingScrape - scrapeSpent);

  function onTabKeyDown(e: KeyboardEvent<HTMLButtonElement>) {
    const tabs: Tab[] = ["design", "scrape"];
    const current = tabs.indexOf(tab);
    const next =
      e.key === "ArrowRight" ? tabs[(current + 1) % tabs.length]
      : e.key === "ArrowLeft" ? tabs[(current - 1 + tabs.length) % tabs.length]
      : e.key === "Home" ? tabs[0]
      : e.key === "End" ? tabs[tabs.length - 1]
      : null;
    if (!next) return;
    e.preventDefault();
    setTab(next);
    requestAnimationFrame(() => document.getElementById(`${next}-tab`)?.focus());
  }

  return (
    <>
      <div role="tablist" aria-label="Pilih mode" className="mx-auto mb-5 inline-flex rounded-buttons border border-ink bg-paper-white p-1 shadow-hard">
        <TabButton
          id="design-tab"
          controls="design-panel"
          active={tab === "design"}
          onClick={() => setTab("design")}
          onKeyDown={onTabKeyDown}
          icon={<FileMd size={16} weight="fill" aria-hidden="true" />}
        >
          Generate DESIGN.md
        </TabButton>
        <TabButton
          id="scrape-tab"
          controls="scrape-panel"
          active={tab === "scrape"}
          onClick={() => setTab("scrape")}
          onKeyDown={onTabKeyDown}
          icon={<Code size={16} weight="fill" aria-hidden="true" />}
        >
          Scrape HTML
        </TabButton>
      </div>

      {/* Both panels stay mounted; hidden with CSS so switching tabs never drops
          an in-flight scrape/generate or its result. */}
      <div id="design-panel" role="tabpanel" aria-labelledby="design-tab" hidden={tab !== "design"}>
        <div className="mx-auto max-w-2xl">
          <GenerationForm
            guest={!authed}
            remaining={design}
            onQuotaExceeded={() => setQuotaOpen(true)}
            onCreated={() => setDesignSpent((s) => s + 1)}
          />
        </div>
      </div>

      <div id="scrape-panel" role="tabpanel" aria-labelledby="scrape-tab" hidden={tab !== "scrape"} className="mx-[calc(50%-50vw)] w-screen px-3 sm:px-5">
        <HtmlScraper
          guest={!authed}
          remaining={scrape}
          onQuotaExceeded={() => setQuotaOpen(true)}
          onConsumed={() => setScrapeSpent((s) => s + 1)}
        />
      </div>

      <UpgradeModal
        open={quotaOpen}
        title="Kredit kamu habis"
        message="Kamu sudah memakai semua kredit di paket ini. Upgrade paket untuk lanjut generate dan scrape."
        ctaLabel="Lihat paket"
        onClose={() => setQuotaOpen(false)}
      />
    </>
  );
}

function TabButton({
  id,
  controls,
  active,
  onClick,
  onKeyDown,
  icon,
  children,
}: {
  id: string;
  controls: string;
  active: boolean;
  onClick: () => void;
  onKeyDown: (e: KeyboardEvent<HTMLButtonElement>) => void;
  icon: React.ReactNode;
  children: React.ReactNode;
}) {
  return (
    <button
      id={id}
      role="tab"
      aria-selected={active}
      aria-controls={controls}
      tabIndex={active ? 0 : -1}
      onClick={onClick}
      onKeyDown={onKeyDown}
      className={`inline-flex items-center gap-2 rounded-[3px] px-4 py-2 text-body-sm font-medium transition-colors ${
        active ? "bg-lime-sprint text-ink" : "text-muted hover:text-ink"
      }`}
    >
      {icon}
      {children}
    </button>
  );
}
