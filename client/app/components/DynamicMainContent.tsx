"use client";

import { useEffect, useRef, useState } from "react";
import { usePathname, useSearchParams } from "next/navigation";
import { useAudio } from "../contexts/AudioContext";
import FullscreenPlayer from "./FullscreenPlayer";

interface DynamicMainContentProps {
  children: React.ReactNode;
}

export default function DynamicMainContent({
  children,
}: DynamicMainContentProps) {
  const pathname = usePathname();
  const searchParams = useSearchParams();
  const { isFullscreenOpen, closeFullscreen } = useAudio();
  const [shouldRenderFullscreen, setShouldRenderFullscreen] =
    useState(isFullscreenOpen);
  const [isFullscreenVisible, setIsFullscreenVisible] =
    useState(isFullscreenOpen);
  const navigationKey = `${pathname}?${searchParams.toString()}`;
  const previousNavigationKeyRef = useRef(navigationKey);

  useEffect(() => {
    if (
      previousNavigationKeyRef.current !== navigationKey &&
      isFullscreenOpen
    ) {
      closeFullscreen();
    }

    previousNavigationKeyRef.current = navigationKey;
  }, [navigationKey, isFullscreenOpen, closeFullscreen]);

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
