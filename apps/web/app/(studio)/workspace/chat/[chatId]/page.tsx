import { notFound } from "next/navigation";
import { z } from "zod";
import { ChatStudio } from "@/components/studio/chat-studio";
import { requireSession } from "@/lib/session";
export default async function ChatPage({
  params,
}: {
  params: Promise<{ chatId: string }>;
}) {
  const { user } = await requireSession();
  const parsed = z.uuid().safeParse((await params).chatId);
  if (!parsed.success) notFound();
  return <ChatStudio userId={user.id} chatId={parsed.data} />;
}
