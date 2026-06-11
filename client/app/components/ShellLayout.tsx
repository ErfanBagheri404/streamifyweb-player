"use client";

import { Suspense } from "react";
import { usePathname } from "next/navigation";
import { useAudio } from "../contexts/AudioContext";
import { useSidePanel } from "../contexts/SidePanelContext";
import MiniPlayer from "./MiniPlayer";
import NowPlayingSidePanel from "./NowPlayingSidePanel";
import DynamicMainContent from "./DynamicMainContent";

interface ShellLayoutProps {
  children: React.ReactNode;
}

export default function ShellLayout({ children }: ShellLayoutProps) {
  const pathname = usePathname();
  const { isOpen } = useSidePanel();
  const { isFullscreenOpen } = useAudio();
  const isAuthPage =
    pathname.startsWith("/signin") || pathname.startsWith("/signup");
  const shouldShowPanelSlot = isOpen && !isFullscreenOpen && !isAuthPage;

  return (
    <>
      <div className="flex h-full min-h-0 min-w-0 flex-1 flex-col gap-2 overflow-x-hidden lg:flex-row lg:gap-0">
        <Suspense fallback={null}>
          <DynamicMainContent>{children}</DynamicMainContent>
        </Suspense>
        <div
          className={`hidden h-full min-h-0 flex-shrink-0 overflow-hidden xl:flex ${
            shouldShowPanelSlot
              ? "w-[340px] opacity-100"
              : "pointer-events-none w-0 opacity-0"
          } transition-all duration-200`}
          style={{ marginInlineStart: shouldShowPanelSlot ? "0.75rem" : "0" }}
          aria-hidden={!shouldShowPanelSlot}
        >
          <NowPlayingSidePanel />
        </div>
      </div>
      <MiniPlayer />
    </>
  );
}
