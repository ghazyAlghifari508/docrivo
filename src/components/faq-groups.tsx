"use client";

import { useState } from "react";
import { Plus, Minus } from "@phosphor-icons/react";
import { Reveal } from "./reveal";

type Group = { label: string; items: string[][] };

export function FaqGroups({ groups }: { groups: Group[] }) {
  const [active, setActive] = useState(0);
  const [open, setOpen] = useState<string | null>(groups[0]?.items[0]?.[0] ?? null);
  const current = groups[active];

  return (
    <div className="grid gap-12 lg:grid-cols-[.7fr_1.3fr]">
      {/* Category rail */}
      <Reveal className="lg:sticky lg:top-24 lg:self-start">
        <div className="flex gap-2 overflow-x-auto pb-1 lg:flex-col lg:overflow-visible">
          {groups.map((g, i) => (
            <button
              key={g.label}
              onClick={() => {
                setActive(i);
                setOpen(g.items[0]?.[0] ?? null);
              }}
              aria-pressed={i === active}
              className={`shrink-0 rounded-buttons border px-4 py-2.5 text-left text-body-sm font-medium transition-colors lg:w-full ${
                i === active
                  ? "border-ink bg-lime-sprint shadow-hard"
                  : "border-rule bg-paper-white text-muted hover:border-ink hover:text-ink"
              }`}
            >
              {g.label}
            </button>
          ))}
        </div>
      </Reveal>

      {/* Accordion */}
      <div className="min-w-0">
        <div className="divide-y divide-rule overflow-hidden rounded-cards border border-ink bg-paper-white shadow-hard">
          {current.items.map(([q, a]) => {
            const isOpen = open === q;
            return (
              <div key={q} className="p-6">
                <button
                  onClick={() => setOpen(isOpen ? null : q)}
                  aria-expanded={isOpen}
                  className="flex w-full items-center justify-between gap-4 text-left text-body-sm font-semibold"
                >
                  {q}
                  <span className="grid size-7 shrink-0 place-items-center rounded-buttons border border-ink">
                    {isOpen ? <Minus size={15} weight="bold" /> : <Plus size={15} weight="bold" />}
                  </span>
                </button>
                <div
                  className={`grid transition-all duration-300 ease-out ${
                    isOpen ? "mt-3 grid-rows-[1fr] opacity-100" : "grid-rows-[0fr] opacity-0"
                  }`}
                >
                  {/* ponytail: grid-rows-[0fr] hides visually but not from AT; hidden removes from a11y tree */}
                  <p hidden={!isOpen} className="overflow-hidden text-body-sm leading-7 text-muted">{a}</p>
                </div>
              </div>
            );
          })}
        </div>
      </div>
    </div>
  );
}
