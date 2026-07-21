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

const SourceIcon: React.FC<SourceIconProps> = ({
  source,
  className = "",
  size = 16,
}) => {
  const iconPath = getSourceIconPath(source);

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
