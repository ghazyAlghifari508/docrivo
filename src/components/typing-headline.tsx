"use client";

import { useEffect, useState } from "react";

const SEGMENTS = [
  { text: "Ubah website apa pun jadi panduan yang " },
  { text: "actually", emph: true },
  { text: " bisa dieksekusi." },
];
const FULL = SEGMENTS.map((s) => s.text).join("");
const H1 =
  "text-heading-lg font-semibold leading-heading-lg tracking-heading-lg md:text-display md:leading-display md:tracking-display";

export function TypingHeadline() {
  const [n, setN] = useState(0);
  const done = n >= FULL.length;

  useEffect(() => {
    if (window.matchMedia("(prefers-reduced-motion: reduce)").matches) return;
    const id = setInterval(() => {
      setN((current) => {
        if (current >= FULL.length) {
          clearInterval(id);
          return current;
        }
        return current + 1;
      });
    }, 42);
    return () => clearInterval(id);
  }, []);

  return (
    <div className="grid max-w-2xl">
      {/* Invisible full copy reserves final height → no layout shift while typing. */}
      <p aria-hidden className={`invisible col-start-1 row-start-1 ${H1}`}>
        {SEGMENTS.map((s, i) => (s.emph ? <span key={i} className="emph">{s.text}</span> : s.text))}
      </p>

      <h1 aria-label={FULL} className={`col-start-1 row-start-1 ${H1}`}>
        {SEGMENTS.map((s, i) => {
          const start = SEGMENTS.slice(0, i).reduce((sum, segment) => sum + segment.text.length, 0);
          const shown = s.text.slice(0, Math.max(0, n - start));
          if (!shown) return null;
          return s.emph ? <span key={i} className="emph">{shown}</span> : <span key={i}>{shown}</span>;
        })}
        <span className={`type-caret ${done ? "type-caret-done" : ""}`} aria-hidden />
      </h1>
    </div>
  );
}
