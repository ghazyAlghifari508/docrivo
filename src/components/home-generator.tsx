"use client";

import { useState } from "react";
import { FileMd, Code } from "@phosphor-icons/react";
import { GenerationForm } from "./generation-form";
import { HtmlScraper } from "./html-scraper";

type Tab = "design" | "scrape";

export function HomeGenerator() {
  const [tab, setTab] = useState<Tab>("design");

  return (
    <>
      <div role="tablist" aria-label="Pilih mode" className="mx-auto mb-5 inline-flex rounded-buttons border border-ink bg-paper-white p-1 shadow-hard">
        <TabButton active={tab === "design"} onClick={() => setTab("design")} icon={<FileMd size={16} weight="fill" aria-hidden="true" />}>
          Generate DESIGN.md
        </TabButton>
        <TabButton active={tab === "scrape"} onClick={() => setTab("scrape")} icon={<Code size={16} weight="fill" aria-hidden="true" />}>
          Scrape HTML
        </TabButton>
      </div>

      {/* Both panels stay mounted; hidden with CSS so switching tabs never drops
          an in-flight scrape/generate or its result. */}
      <div hidden={tab !== "design"}>
        <div className="mx-auto max-w-2xl">
          <GenerationForm />
        </div>
      </div>

      <div hidden={tab !== "scrape"} className="mx-[calc(50%_-_50vw)] w-screen px-3 sm:px-5">
        <HtmlScraper />
      </div>
    </>
  );
}

function TabButton({
  active,
  onClick,
  icon,
  children,
}: {
  active: boolean;
  onClick: () => void;
  icon: React.ReactNode;
  children: React.ReactNode;
}) {
  return (
    <button
      role="tab"
      aria-selected={active}
      onClick={onClick}
      className={`inline-flex items-center gap-2 rounded-[3px] px-4 py-2 text-body-sm font-medium transition-colors ${
        active ? "bg-lime-sprint text-ink" : "text-muted hover:text-ink"
      }`}
    >
      {icon}
      {children}
    </button>
  );
}
