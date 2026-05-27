import React, { memo } from "react";
import Image from "next/image";
import { SearchResult } from "./types";
import { shortCount } from "./helpers";

interface ArtistCardProps {
  item: SearchResult;
  onPress: () => void;
}

function formatSubscribers(count: number | string | undefined): string {
  if (count == null || count === 0) return "";
  const num = typeof count === "string" ? parseInt(count, 10) : count;
  if (isNaN(num)) return "";
  return shortCount(num) + " subscribers";
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
  return item.thumbnailUrl || item.img || item.thumbnail;
}

export const ArtistCard = memo<ArtistCardProps>(({ item, onPress }) => {
  const thumbnail = findBestThumbnail(item);

  // For channels/artists, the name can be in title, author, or name fields
  const displayName =
    item.title || item.author || (item as any).name || "Unknown";

  const subCount = formatSubscribers((item as any).subCount);

  return (
    <button
      onClick={onPress}
      className="flex flex-col items-center gap-2 p-3 hover:bg-neutral-800/50 rounded-lg transition-colors min-w-[140px] max-w-[140px]"
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
        <div className="w-[120px] h-[120px] rounded-full bg-neutral-700" />
      )}

      {/* Artist Name & Subscribers */}
      <div className="text-center w-full">
        <h3 className="text-white text-sm font-medium truncate px-1">
          {displayName}
        </h3>
        {subCount && (
          <p className="text-neutral-400 text-xs mt-0.5 truncate px-1">
            {subCount}
          </p>
        )}
      </div>
    </button>
  );
});
ArtistCard.displayName = "ArtistCard";
