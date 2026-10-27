import { cn } from "@drishya/ui/lib/utils";
import type { ReactNode } from "react";

export function WindowPanel({
  title,
  accent = "pink",
  children,
  className,
}: {
  title: string;
  accent?: "pink" | "green" | "purple" | "yellow";
  children: ReactNode;
  className?: string;
}) {
  const colors = {
    pink: "bg-pink",
    green: "bg-green",
    purple: "bg-purple",
    yellow: "bg-yellow",
  };
  return (
    <section className={cn("window-panel", className)} aria-label={title}>
      <header className="window-bar">
        <span
          className={cn("size-2.5 shrink-0", colors[accent])}
          aria-hidden="true"
        />
        <h2 className="window-title">{title}</h2>
        <span className="window-stripes" aria-hidden="true" />
      </header>
      {children}
    </section>
  );
}
