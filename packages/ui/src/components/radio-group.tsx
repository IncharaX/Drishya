"use client";
import { RadioGroup as Primitive } from "radix-ui";
import type { ComponentProps } from "react";
export function RadioGroup(props: ComponentProps<typeof Primitive.Root>) {
  return <Primitive.Root data-slot="radio-group" {...props} />;
}
export function RadioOption(props: ComponentProps<typeof Primitive.Item>) {
  return <Primitive.Item data-slot="radio-option" {...props} />;
}
