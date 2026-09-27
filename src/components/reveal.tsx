import type { CSSProperties, ElementType, ReactNode } from "react";

// CSS-only reveal. No observer JS; full-page captures stay visible.
export function Reveal({
  children,
  as: Tag = "div",
  delay = 0,
  className = "",
}: {
  children: ReactNode;
  as?: ElementType;
  delay?: number;
  className?: string;
}) {
  return (
    <Tag
      style={{ animationDelay: `${delay}ms` } as CSSProperties}
      className={`reveal ${className}`}
    >
      {children}
    </Tag>
  );
}
