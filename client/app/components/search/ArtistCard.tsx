import React, { memo } from "react";
import Image from "next/image";
import { SearchResult } from "./types";
import { shortCount } from "./helpers";
import { useAppLanguage } from "../../hooks/useAppLanguage";

interface ArtistCardProps {
  item: SearchResult;
  onPress: () => void;
}

function formatSubscribers(count: number | string | undefined): string {
  if (count == null || count === 0) return "";
  const num = typeof count === "string" ? parseInt(count, 10) : count;
  if (isNaN(num)) return "";
  return shortCount(num);
}

// Find the best quality thumbnail (prefer 512x512 or highest available)
function findBestThumbnail(item: SearchResult): string | undefined {
  // First, try to find 512x512 from authorThumbnails
  if (item.authorThumbnails && item.authorThumbnails.length > 0) {
    // Sort by width descending to get highest quality first
    const sorted = [...item.authorThumbnails].sort(
      (a, b) => (b.width || 0) - (a.width || 0)
    );
    // Return the highest quality (512x512 or closest)
    return sorted[0]?.url;
  }

  // Fallback to other thumbnail fields
  return item.thumbnailUrl || item.img;
}

export const ArtistCard = memo<ArtistCardProps>(({ item, onPress }) => {
  const { t } = useAppLanguage();
  const thumbnail = findBestThumbnail(item);

  // For channels/artists, the name can be in title, author, or name fields
  const displayName =
    item.title || item.author || (item as any).name || "Unknown";

  const subCount = formatSubscribers((item as any).subCount);
  const subCountLabel = subCount ? t("search.subscribers", { count: subCount }) : "";

  return (
    <button
      onClick={onPress}
      className="flex min-w-[140px] max-w-[140px] flex-col items-center gap-2 rounded-lg p-3 transition-colors hover:bg-[color:color-mix(in_srgb,var(--foreground)_6%,transparent)]"
    >
      {/* Circular Avatar - 120px */}
      {thumbnail ? (
        <Image
          src={thumbnail}
          alt={displayName}
          width={120}
          height={120}
          className="w-[120px] h-[120px] rounded-full object-cover"
          unoptimized
        />
      ) : (
        <div className="theme-surface-soft h-[120px] w-[120px] rounded-full border" />
      )}

      {/* Artist Name & Subscribers */}
      <div className="w-full text-center">
        <h3 className="truncate px-1 text-sm font-medium text-[color:var(--foreground)]">
          {displayName}
        </h3>
        {subCountLabel && (
          <p className="theme-muted mt-0.5 truncate px-1 text-xs">
            {subCountLabel}
          </p>
        )}
      </div>
    </button>
  );
});
ArtistCard.displayName = "ArtistCard";
