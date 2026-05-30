"use client";

import { useAudio } from "../contexts/AudioContext";

interface DynamicMainContentProps {
  children: React.ReactNode;
}

export default function DynamicMainContent({ children }: DynamicMainContentProps) {
  const { isPlayerVisible } = useAudio();

  return (
    <main
      className={`flex-1 overflow-y-auto hide-scrollbar relative ${
        isPlayerVisible ? "pb-20" : ""
      }`}
    >
      {children}
    </main>
  );
}