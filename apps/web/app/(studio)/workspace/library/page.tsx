import { LessonLibrary } from "@/components/lesson-library";
import { requireSession } from "@/lib/session";
export default async function LibraryPage() {
  const { user } = await requireSession();
  return <LessonLibrary userId={user.id} />;
}
