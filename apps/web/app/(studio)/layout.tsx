import type { ReactNode } from "react";
import { requireSession } from "@/lib/session";

export default async function StudioLayout({
  children,
}: {
  children: ReactNode;
}) {
  await requireSession();
  return children;
}
