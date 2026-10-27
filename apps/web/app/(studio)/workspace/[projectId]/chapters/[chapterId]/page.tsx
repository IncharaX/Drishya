import type { Metadata } from "next";
import { notFound } from "next/navigation";
import { z } from "zod";
import { StoryboardWorkspace } from "@/components/storyboard-workspace";
import { requireSession } from "@/lib/session";

export const metadata: Metadata = { title: "Script & storyboard — Drishya" };

export default async function StoryboardPage({
  params,
  searchParams,
}: {
  params: Promise<{ projectId: string; chapterId: string }>;
  searchParams: Promise<Record<string, string | string[] | undefined>>;
}) {
  const parsed = z
    .object({ projectId: z.uuid(), chapterId: z.uuid() })
    .safeParse(await params);
  if (!parsed.success) notFound();
  const { user } = await requireSession();
  const query = await searchParams;
  return (
    <StoryboardWorkspace
      userId={user.id}
      {...parsed.data}
      initialVersionId={z.uuid().safeParse(query.versionId).data}
      initialTakeId={z.uuid().safeParse(query.takeId).data}
    />
  );
}
