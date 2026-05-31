"use client";

import { useEffect, useState } from "react";
import { useAudio } from "../contexts/AudioContext";
import FullscreenPlayer from "./FullscreenPlayer";

interface DynamicMainContentProps {
  children: React.ReactNode;
}

export default function DynamicMainContent({
  children,
}: DynamicMainContentProps) {
  const { isFullscreenOpen } = useAudio();
  const [shouldRenderFullscreen, setShouldRenderFullscreen] =
    useState(isFullscreenOpen);
  const [isFullscreenVisible, setIsFullscreenVisible] =
    useState(isFullscreenOpen);

  useEffect(() => {
    let enterFrameId: number | undefined;
    let visibleFrameId: number | undefined;
    let timeoutId: number | undefined;

    if (isFullscreenOpen) {
      enterFrameId = window.requestAnimationFrame(() => {
        setShouldRenderFullscreen(true);
        visibleFrameId = window.requestAnimationFrame(() => {
          setIsFullscreenVisible(true);
        });
      });
    } else if (shouldRenderFullscreen) {
      visibleFrameId = window.requestAnimationFrame(() => {
        setIsFullscreenVisible(false);
      });
      timeoutId = window.setTimeout(() => {
        setShouldRenderFullscreen(false);
      }, 280);
    }

    return () => {
      if (enterFrameId) {
        window.cancelAnimationFrame(enterFrameId);
      }
      if (visibleFrameId) {
        window.cancelAnimationFrame(visibleFrameId);
      }
      if (timeoutId) {
        window.clearTimeout(timeoutId);
      }
    };
  }, [isFullscreenOpen, shouldRenderFullscreen]);

  return (
    <main
      className={`flex-1 relative ${
        shouldRenderFullscreen
          ? "overflow-hidden"
          : "overflow-y-auto hide-scrollbar"
      } min-h-0 pb-20`}
    >
      {isFullscreenOpen ? <FullscreenPlayer /> : children}
    </main>
  );
}
