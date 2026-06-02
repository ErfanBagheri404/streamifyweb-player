import type { Metadata } from "next";
import { Suspense } from "react";
import "./globals.css";
import LeftPanel from "./components/LeftPanel";
import MiniPlayer from "./components/MiniPlayer";
import DynamicMainContent from "./components/DynamicMainContent";
import { AudioProvider } from "./contexts/AudioContext";
import { dmSans, spaceMono } from "./fonts";

export const metadata: Metadata = {
  title: "Streamify Player",
  description: "Streamify. The One And Only.",
};

export default function RootLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  return (
    <html
      lang="en"
      className={`h-full antialiased ${dmSans.variable} ${spaceMono.variable}`}
    >
      <body
        className={`${dmSans.className} h-full bg-black text-white flex flex-row p-3`}
      >
        <AudioProvider>
          <LeftPanel />
          <Suspense fallback={null}>
            <DynamicMainContent>{children}</DynamicMainContent>
          </Suspense>
          <MiniPlayer />
        </AudioProvider>
      </body>
    </html>
  );
}
