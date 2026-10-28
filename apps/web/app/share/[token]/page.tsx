import { SharedVideoPage } from "@/components/studio/shared-video";
export const metadata = {
  title: "Shared explanation · Drishya",
  robots: { index: false, follow: false },
  referrer: "no-referrer",
};
export default async function Page({
  params,
}: {
  params: Promise<{ token: string }>;
}) {
  const { token } = await params;
  return <SharedVideoPage key={token} token={token} />;
}
