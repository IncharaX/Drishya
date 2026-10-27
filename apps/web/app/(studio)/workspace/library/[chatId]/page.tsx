import { notFound } from "next/navigation";
import { z } from "zod";
import { LibraryVideoPage } from "@/components/studio/video-library";
import { requireSession } from "@/lib/session";
export default async function VideoPage({
  params,
  searchParams,
}: {
  params: Promise<{ chatId: string }>;
  searchParams: Promise<{ revision?: string }>;
}) {
  const { user } = await requireSession();
  const id = z.uuid().safeParse((await params).chatId);
  if (!id.success) notFound();
  return (
    <LibraryVideoPage
      userId={user.id}
      chatId={id.data}
      revisionId={z.uuid().safeParse((await searchParams).revision).data}
    />
  );
}
