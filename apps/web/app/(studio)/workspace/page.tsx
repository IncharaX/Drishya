import type { Metadata } from "next";
import { Workspace } from "@/components/workspace";
import { requireSession } from "@/lib/session";

export const metadata: Metadata = { title: "Your studio — Drishya" };

export default async function WorkspacePage() {
  const { user } = await requireSession();
  return <Workspace userId={user.id} />;
}
