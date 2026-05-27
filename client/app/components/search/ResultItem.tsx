import React, { memo } from "react";
import { SearchResult } from "./types";
import { formatDuration, shortCount } from "./helpers";
import Image from "next/image";

interface ResultItemProps {
  item: SearchResult;
  onPress: () => void;
}

function formatSubscribers(
  count: number | string | undefined,
  source: string | undefined
): string {
  if (count == null || count === 0) return "";
  const num = typeof count === "string" ? parseInt(count, 10) : count;
  if (isNaN(num)) return "";

  const formatted = shortCount(num);
  if (source === "soundcloud" || source === "jiosaavn") {
    return `${formatted} listeners`;
  }
  return `${formatted} Subscribers`;
}

export const ResultItem = memo<ResultItemProps>(({ item, onPress }) => {
  const isArtist = item.type === "artist" || item.type === "channel";
  const isYouTubeSource =
    item.source === "youtube" || item.source === "youtubemusic";

  // YouTube mix detection
  const isYouTubeMixPlaylist =
    item.type === "playlist" &&
    isYouTubeSource &&
    ((item as any).videos === -2 ||
      (item as any).playlistType === "MIX_STREAM");

  // ---------- FIX: For channels/artists, use name/author as fallback ----------
  const channelName = item.title || item.name || item.author || "";
  const displayTitle = isYouTubeMixPlaylist ? item.author : channelName;

  const displayAuthor = isYouTubeMixPlaylist ? undefined : item.author;

  // Thumbnail
  const thumbnail =
    (isArtist
      ? item.thumbnailUrl ||
        item.img ||
        item.authorThumbnails?.[0]?.url ||
        item.thumbnail
      : item.thumbnailUrl || item.img) || "";

  const durationFormatted = !isArtist
    ? formatDuration(parseInt(item.duration) || 0, item.source)
    : null;

  const viewsFormatted =
    !isArtist && item.views && item.views !== "-1" && item.views !== "0"
      ? shortCount(item.views) + " views"
      : undefined;

  const subCountLabel = isArtist
    ? formatSubscribers((item as any).subCount, item.source)
    : "";

  // Thumbnail styling
  const thumbnailClasses = isArtist
    ? "w-12 h-12 rounded-full object-cover mr-3"
    : isYouTubeSource
    ? "w-64 h-36 rounded-xl object-cover mr-3"
    : "w-32 h-32 rounded-xl object-cover mr-3";

  const placeholderClasses = isArtist
    ? "w-12 h-12 rounded-full bg-neutral-700 mr-3"
    : isYouTubeSource
    ? "w-64 h-36 rounded-xl bg-neutral-700 mr-3"
    : "w-32 h-32 rounded-xl bg-neutral-700 mr-3";

  const imgWidth = isArtist ? 48 : isYouTubeSource ? 256 : 64;
  const imgHeight = isArtist ? 48 : isYouTubeSource ? 144 : 64;

  return (
    <button
      onClick={onPress}
      className="w-full text-left flex py-2.5 rounded-lg transition-colors"
    >
      {thumbnail ? (
        <Image
          src={thumbnail}
          alt=""
          width={imgWidth}
          height={imgHeight}
          className={thumbnailClasses}
          unoptimized
        />
      ) : (
        <div className={placeholderClasses} />
      )}

      <div className="flex-1 min-w-0">
        {/* Channel / Artist name */}
        <h3 className="text-white font-medium truncate">{displayTitle}</h3>

        {/* Subscriber / listener count – now properly below the name */}
        {isArtist && subCountLabel && (
          <p className="text-neutral-400 text-sm truncate">{subCountLabel}</p>
        )}

        {/* Author line for non‑artists */}
        {!isArtist && displayAuthor && (
          <p className="text-neutral-400 text-sm truncate">{displayAuthor}</p>
        )}

        {!isArtist && (
          <div className="flex items-center gap-2 text-xs text-neutral-500">
            {durationFormatted && <span>{durationFormatted}</span>}
            {viewsFormatted && (
              <>
                <span className="w-1 h-1 rounded-full bg-neutral-600" />
                <span>{viewsFormatted}</span>
              </>
            )}
            {item.uploaded && (
              <>
                <span className="w-1 h-1 rounded-full bg-neutral-600" />
                <span>{item.uploaded}</span>
              </>
            )}
          </div>
        )}
      </div>
    </button>
  );
});

ResultItem.displayName = "ResultItem";
