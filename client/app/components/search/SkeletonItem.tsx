import React from "react";
import { SourceType } from "./types";

interface SkeletonItemProps {
  selectedSource: SourceType;
}

export const SkeletonItem: React.FC<SkeletonItemProps> = ({
  selectedSource,
}) => {
  const isYouTubeSource =
    selectedSource === "youtube" || selectedSource === "youtubemusic";
  const isSoundCloudSource = selectedSource === "soundcloud";
  const isJioSaavnSource = selectedSource === "jiosaavn";

  const containerClasses = isYouTubeSource
    ? "animate-float-pulse flex items-start gap-3 py-2.5"
    : isSoundCloudSource
    ? "animate-float-pulse flex items-start gap-4 py-3"
    : isJioSaavnSource
    ? "animate-float-pulse flex items-start gap-3.5 py-3"
    : "animate-float-pulse flex items-start gap-3 py-2.5";

  const coverClasses = isYouTubeSource
    ? "h-36 w-64 rounded-xl"
    : isSoundCloudSource
    ? "h-20 w-20 rounded-2xl"
    : isJioSaavnSource
    ? "h-16 w-16 rounded-xl"
    : "h-16 w-16 rounded-xl";

  const titleClasses = isYouTubeSource
    ? "loading-skeleton mb-1.5 h-4 w-full rounded-lg"
    : isSoundCloudSource
    ? "loading-skeleton mb-2 h-4 w-[72%] rounded-lg"
    : isJioSaavnSource
    ? "loading-skeleton mb-2 h-4 w-[68%] rounded-lg"
    : "loading-skeleton mb-1.5 h-4 w-full rounded-lg";

  const subtitleClasses = isYouTubeSource
    ? "loading-skeleton h-3 w-3/4 rounded-md"
    : isSoundCloudSource
    ? "loading-skeleton mb-2 h-3 w-[52%] rounded-md"
    : isJioSaavnSource
    ? "loading-skeleton mb-1.5 h-3 w-[58%] rounded-md"
    : "loading-skeleton h-3 w-3/4 rounded-md";

  const metaClasses = isSoundCloudSource
    ? "loading-skeleton h-3 w-[38%] rounded-md"
    : isJioSaavnSource
    ? "loading-skeleton h-3 w-[42%] rounded-md"
    : null;

  return (
    <div className={containerClasses}>
      <div className={`loading-skeleton shrink-0 ${coverClasses}`} />
      <div className="flex-1">
        <div className={titleClasses} />
        <div className={subtitleClasses} />
        {metaClasses ? <div className={metaClasses} /> : null}
      </div>
    </div>
  );
};
