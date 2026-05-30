"use client";

import { useAudio } from "../contexts/AudioContext";
import FullscreenPlayer from "./FullscreenPlayer";

interface DynamicMainContentProps {
  children: React.ReactNode;
}

export default function DynamicMainContent({
  children,
}: DynamicMainContentProps) {
  const { isFullscreenOpen } = useAudio();

  return (
    <main
      className={`flex-1 relative ${
        isFullscreenOpen ? "overflow-hidden" : "overflow-y-auto hide-scrollbar"
      } min-h-0 pb-20`}
    >
      {isFullscreenOpen ? <FullscreenPlayer /> : children}
    </main>
  );
}
