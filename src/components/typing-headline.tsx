"use client";

import { useEffect, useState } from "react";

// Rotating typewriter: types a phrase, pauses, deletes it, then types the next -
// looping forever. The rotating tail is set in Fraunces italic (the brand's
// emphasis signature). Respects reduced-motion by showing the first phrase static.
const PHRASES = ["desain AI.", "prompt visual.", "aturan UI.", "vibe coding."];
const TYPE_MS = 55;
const DELETE_MS = 32;
const HOLD_MS = 1400;

const reduceMotion = () =>
  typeof window !== "undefined" && window.matchMedia("(prefers-reduced-motion: reduce)").matches;

export function TypingHeadline() {
  const reduced = reduceMotion();
  const [text, setText] = useState(PHRASES[0]);

  useEffect(() => {
    if (reduced) return;

    let phrase = 0;
    let char = PHRASES[0].length;
    let deleting = true;
    let timer: ReturnType<typeof setTimeout>;

    const tick = () => {
      const current = PHRASES[phrase];
      if (!deleting) {
        char += 1;
        setText(current.slice(0, char));
        if (char === current.length) {
          deleting = true;
          timer = setTimeout(tick, HOLD_MS);
          return;
        }
        timer = setTimeout(tick, TYPE_MS);
      } else {
        char -= 1;
        setText(current.slice(0, char));
        if (char === 0) {
          deleting = false;
          phrase = (phrase + 1) % PHRASES.length;
          timer = setTimeout(tick, TYPE_MS);
          return;
        }
        timer = setTimeout(tick, DELETE_MS);
      }
    };

    timer = setTimeout(tick, HOLD_MS);
    return () => clearTimeout(timer);
  }, [reduced]);

  return (
    <h1 className="mx-auto whitespace-nowrap text-center text-[clamp(20px,4vw,56px)] font-semibold leading-display tracking-display">
      Ubah website jadi{" "}
      <span className="inline whitespace-nowrap align-baseline">
        <span className="emph">{text}</span>
        {!reduced && <span className="type-caret" aria-hidden />}
      </span>
    </h1>
  );
}
