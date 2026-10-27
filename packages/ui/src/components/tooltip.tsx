"use client";
import { Tooltip as TooltipPrimitive } from "radix-ui";
import type { ReactNode } from "react";
export const TooltipProvider = TooltipPrimitive.Provider;
export function Tooltip({
  children,
  content,
}: {
  children: ReactNode;
  content: ReactNode;
}) {
  return (
    <TooltipPrimitive.Root delayDuration={300}>
      <TooltipPrimitive.Trigger asChild>{children}</TooltipPrimitive.Trigger>
      <TooltipPrimitive.Portal>
        <TooltipPrimitive.Content
          sideOffset={8}
          className="z-[100] max-w-64 border border-ink bg-ink px-3 py-2 font-sans text-xs leading-relaxed text-paper shadow-[var(--shadow-sm)]"
        >
          {content}
          <TooltipPrimitive.Arrow className="fill-ink" />
        </TooltipPrimitive.Content>
      </TooltipPrimitive.Portal>
    </TooltipPrimitive.Root>
  );
}
