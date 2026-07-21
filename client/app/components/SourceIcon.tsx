"use client";

import React from "react";
import Image from "next/image";

type SourceIconProps = {
  source?: string | null;
  className?: string;
  size?: number;
};

const SOURCE_ICON_MAP: Record<string, string> = {
  deezer: "/sources/Deezer.svg",
  itunes: "/sources/ITunes.svg",
  jiosaavn: "/sources/JioSaavn.svg",
  mixed: "/StreamifyLogo.svg",
  soundcloud: "/sources/soundcloud.svg",
  spotify: "/sources/Spotify.svg",
  youtube: "/sources/YouTube.svg",
  youtubemusic: "/sources/YoutubeMusic.svg",
};

function normalizeSource(source?: string | null): string {
  return (source || "").trim().toLowerCase();
}

export function getSourceIconPath(source?: string | null): string | null {
  return SOURCE_ICON_MAP[normalizeSource(source)] || null;
}

/**
 * Inline SVG for the Streamify "S" logo.
 * Uses currentColor so it adapts to the theme foreground.
 */
function StreamifyLogoIcon({ className = "", style }: { className?: string; style?: React.CSSProperties }) {
  return (
    <svg
      viewBox="0 0 35 35"
      fill="none"
      xmlns="http://www.w3.org/2000/svg"
      className={className}
      style={style}
      aria-hidden="true"
    >
      <path
        d="M24.6094 0C30.348 0 35 4.65199 35 10.3906V35H28.4375V10.3906C28.4375 8.27641 26.7236 6.5625 24.6094 6.5625C22.4952 6.5625 20.7812 8.27641 20.7812 10.3906V24.6094C20.7812 30.348 16.1293 35 10.3906 35C4.65199 35 0 30.348 0 24.6094V0H6.5625V24.6094C6.5625 26.7236 8.27641 28.4375 10.3906 28.4375C12.5048 28.4375 14.2188 26.7236 14.2188 24.6094V10.3906C14.2188 4.65199 18.8707 0 24.6094 0Z"
        fill="currentColor"
      />
    </svg>
  );
}

const SourceIcon: React.FC<SourceIconProps> = ({
  source,
  className = "",
  size = 16,
}) => {
  const normalized = normalizeSource(source);

  // Mixed uses inline SVG with currentColor so it adapts to theme.
  // The logo fills its entire viewBox with no internal padding,
  // so scale it down slightly to match the visual weight of other icons.
  if (normalized === "mixed") {
    const scaledSize = Math.round(size * 0.8);
    return (
      <StreamifyLogoIcon
        className={className}
        style={{ width: scaledSize, height: scaledSize }}
      />
    );
  }

  const iconPath = SOURCE_ICON_MAP[normalized];
  if (!iconPath) {
    return null;
  }

  return (
    <Image
      src={iconPath}
      alt=""
      aria-hidden="true"
      width={size}
      height={size}
      className={className}
    />
  );
};

export default SourceIcon;
