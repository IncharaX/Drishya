"use client";
import { Check } from "lucide-react";
import { Checkbox as Primitive } from "radix-ui";
import type { ComponentProps } from "react";
export function Checkbox(props: ComponentProps<typeof Primitive.Root>) {
  return (
    <Primitive.Root
      {...props}
      className="inline-flex size-4 shrink-0 items-center justify-center border border-ink bg-card outline-none data-[state=checked]:bg-pink disabled:cursor-default focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-ink"
    >
      <Primitive.Indicator>
        <Check size={12} />
      </Primitive.Indicator>
    </Primitive.Root>
  );
}
