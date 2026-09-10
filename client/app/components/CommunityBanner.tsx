"use client";

import { useEffect, useState } from "react";
import { useAudio } from "../contexts/AudioContext";
import { useSettings } from "../contexts/SettingsContext";
import { useAppLanguage } from "../hooks/useAppLanguage";

const TELEGRAM_URL = "https://t.me/StreamifyPlayer";

function TelegramIcon({ className = "h-3.5 w-3.5" }: { className?: string }) {
  return (
    <svg
      viewBox="0 0 24 24"
      fill="currentColor"
      className={className}
      aria-hidden="true"
    >
      <path d="M12 2C6.48 2 2 6.48 2 12s4.48 10 10 10 10-4.48 10-10S17.52 2 12 2zm4.64 6.8c-.15 1.58-.8 5.42-1.13 7.19-.14.75-.42 1-.68 1.03-.58.05-1.02-.38-1.58-.75-.88-.58-1.38-.94-2.23-1.5-.99-.65-.35-1.01.22-1.59.15-.15 2.71-2.48 2.76-2.69a.2.2 0 00-.05-.18c-.06-.05-.14-.03-.21-.02-.09.02-1.49.95-4.22 2.79-.4.27-.76.41-1.08.4-.36-.01-1.04-.2-1.55-.37-.63-.2-1.12-.31-1.08-.66.02-.18.27-.36.74-.55 2.92-1.27 4.86-2.11 5.83-2.51 2.78-1.16 3.35-1.36 3.73-1.36.08 0 .27.02.39.12.1.08.13.19.14.27-.01.06.01.24 0 .38z" />
    </svg>
  );
}

export default function CommunityBanner() {
  const { settings, updateSettings } = useSettings();
  const { isFullscreenOpen } = useAudio();
  const { t } = useAppLanguage();

  const visible = settings.showCommunityBanner && !isFullscreenOpen;
  const [bannerRef, setBannerRef] = useState<HTMLDivElement | null>(null);

  useEffect(() => {
    const root = document.documentElement;
    if (!visible) {
      // Keep the pre-paint "off" marker (never "on") so dismissed banners
      // stay hidden across hydration and later navigations.
      root.dataset.communityBanner = "off";
      root.style.removeProperty("--community-banner-height");
      return;
    }

    // Always ensure "on" (pre-paint script may have set it already).
    root.dataset.communityBanner = "on";

    const publishHeight = () => {
      if (bannerRef) {
        root.style.setProperty(
          "--community-banner-height",
          `${bannerRef.getBoundingClientRect().height}px`
        );
      }
    };

    publishHeight();

    if (typeof ResizeObserver === "undefined" || !bannerRef) return;

    const observer = new ResizeObserver(publishHeight);
    observer.observe(bannerRef);
    return () => observer.disconnect();
  }, [visible, bannerRef]);

  if (!visible) return null;

  return (
    <div
      ref={setBannerRef}
      className="community-banner fixed inset-x-0 top-0 z-[60] flex items-center justify-center gap-1 px-3 py-1.5 text-xs font-semibold backdrop-blur-sm"
      style={{
        backgroundColor:
          "color-mix(in srgb, var(--theme-accent) 14%, var(--background))",
        borderBottom:
          "1px solid color-mix(in srgb, var(--theme-accent) 25%, transparent)",
        color: "var(--theme-accent)",
      }}
    >
      <a
        href={TELEGRAM_URL}
        target="_blank"
        rel="noopener noreferrer"
        className="flex min-w-0 items-center gap-2 transition-opacity hover:opacity-75"
      >
        <TelegramIcon />
        <span className="truncate">{t("communityBanner.text")}</span>
      </a>
      <button
        type="button"
        onClick={() => updateSettings({ showCommunityBanner: false })}
        className="ms-2 flex h-5 w-5 shrink-0 items-center justify-center rounded-full transition hover:bg-[color:color-mix(in_srgb,var(--theme-accent)_18%,transparent)]"
        aria-label={t("communityBanner.dismiss")}
      >
        <svg
          viewBox="0 0 24 24"
          fill="none"
          stroke="currentColor"
          strokeWidth="2.4"
          strokeLinecap="round"
          className="h-3 w-3"
          aria-hidden="true"
        >
          <path d="M18 6L6 18M6 6l12 12" />
        </svg>
      </button>
    </div>
  );
}
