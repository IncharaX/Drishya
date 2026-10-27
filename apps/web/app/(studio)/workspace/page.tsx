import { ChatStudio } from "@/components/studio/chat-studio";
import { requireSession } from "@/lib/session";
export default async function WorkspacePage() {
  const { user } = await requireSession();
  return <ChatStudio userId={user.id} />;
}
