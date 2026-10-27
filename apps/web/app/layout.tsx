import type { Metadata } from "next";
import type { ReactNode } from "react";
import "@fontsource/inter/400.css";
import "@fontsource/inter/500.css";
import "@fontsource/inter/600.css";
import "@fontsource/inter/700.css";
import "@fontsource/manrope/500.css";
import "@fontsource/manrope/700.css";
import "@fontsource/instrument-serif/400.css";
import "@fontsource/instrument-serif/400-italic.css";
import "@fontsource/ibm-plex-mono/400.css";
import "@fontsource/ibm-plex-mono/500.css";
import "@fontsource/noto-sans-devanagari/400.css";
import "@fontsource/noto-sans-devanagari/500.css";
import "@fontsource/noto-sans-kannada/400.css";
import "@fontsource/noto-sans-kannada/500.css";
import "@fontsource/noto-sans-telugu/400.css";
import "@fontsource/noto-sans-telugu/500.css";
import "@drishya/ui/styles/globals.css";
import { Providers } from "@/components/providers";

export const metadata: Metadata = {
  title: "Drishya — Your ideas, in motion",
  description:
    "Create animated explanations from a conversation, in your language.",
};

export default function RootLayout({ children }: { children: ReactNode }) {
  return (
    <html lang="en">
      <body>
        <Providers>{children}</Providers>
      </body>
    </html>
  );
}
