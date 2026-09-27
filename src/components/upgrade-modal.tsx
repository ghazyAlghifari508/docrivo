"use client";

import { Link } from "@tanstack/react-router";
import { useEffect, useRef, type KeyboardEvent } from "react";
import { createPortal } from "react-dom";
import { Lock, X } from "@phosphor-icons/react";

/** Reusable blur-backdrop modal for both credit-exhausted and template-lock. */
export function UpgradeModal({
  open,
  title,
  message,
  ctaLabel,
  onClose,
  fixed = true,
}: {
  open: boolean;
  title: string;
  message: string;
  ctaLabel: string;
  onClose?: () => void;
  fixed?: boolean;
}) {
  const panelRef = useRef<HTMLDivElement>(null);
  const returnFocusRef = useRef<HTMLElement | null>(null);

  useEffect(() => {
    if (!open) return;
    returnFocusRef.current = document.activeElement instanceof HTMLElement ? document.activeElement : null;
    const first = panelRef.current?.querySelector<HTMLElement>("a,button");
    first?.focus();
    return () => {
      const target = returnFocusRef.current;
      if (target && document.contains(target)) target.focus();
    };
  }, [open]);

  if (!open) return null;

  function onKeyDown(e: KeyboardEvent<HTMLDivElement>) {
    if (e.key === "Escape") {
      onClose?.();
      return;
    }
    if (e.key !== "Tab") return;
    const focusable = panelRef.current?.querySelectorAll<HTMLElement>("a,button") ?? [];
    if (focusable.length === 0) return;
    const first = focusable[0];
    const last = focusable[focusable.length - 1];
    if (e.shiftKey && document.activeElement === first) {
      e.preventDefault();
      last.focus();
    } else if (!e.shiftKey && document.activeElement === last) {
      e.preventDefault();
      first.focus();
    }
  }

  const modal = (
    <div
      role="dialog"
      aria-modal="true"
      aria-label={title}
      onKeyDown={onKeyDown}
      className={`${fixed ? "fixed" : "absolute"} inset-0 z-50 grid place-items-center bg-ink/40 p-4 backdrop-blur-md`}
    >
      <div ref={panelRef} className="relative w-full max-w-md rounded-cards border border-ink bg-paper-white p-8 text-center shadow-hard-xl">
        {onClose ? (
          <button
            onClick={onClose}
            aria-label="Tutup"
            className="absolute right-3 top-3 grid size-8 place-items-center rounded-buttons border border-ink bg-paper-white text-ink hover:bg-cream"
          >
            <X size={15} weight="bold" aria-hidden="true" />
          </button>
        ) : null}

        <span className="mx-auto grid size-12 place-items-center rounded-full border border-ink bg-lime-sprint">
          <Lock size={22} weight="fill" className="text-ink" aria-hidden="true" />
        </span>
        <h2 className="mt-4 text-heading font-semibold leading-heading tracking-heading">{title}</h2>
        <p className="mt-3 text-body-sm leading-7 text-muted">{message}</p>

        <Link
          to="/pricing"
          className="pressable mt-6 inline-flex h-12 w-full items-center justify-center rounded-buttons border border-ink bg-lime-sprint px-6 text-body-sm font-medium text-ink shadow-hard"
        >
          {ctaLabel}
        </Link>
      </div>
    </div>
  );

  return fixed && typeof document !== "undefined" ? createPortal(modal, document.body) : modal;
}
