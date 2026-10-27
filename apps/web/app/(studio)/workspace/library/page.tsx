import { VideoLibraryView } from "@/components/studio/video-library";
import { requireSession } from "@/lib/session";
export default async function LibraryPage() {
  const { user } = await requireSession();
  return <VideoLibraryView userId={user.id} />;
}
