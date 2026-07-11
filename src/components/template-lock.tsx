"use client";

import { UpgradeModal } from "./upgrade-modal";

/** Always-on, non-dismissible lock overlay for the Template page (non pro+). */
export function TemplateLock() {
  return (
    <UpgradeModal
      open
      title="Fitur Template terkunci"
      message="Halaman Template hanya untuk paket Pro+. Upgrade untuk membuka library template DESIGN.md."
      ctaLabel="Upgrade ke Pro+"
      fixed={false}
    />
  );
}
