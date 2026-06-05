import React, { memo } from "react";
import { SearchResult } from "./types";
import { formatDuration, shortCount } from "./helpers";
import Image from "next/image";

interface ResultItemProps {
  item: SearchResult;
  onPress: () => void;
}

type SearchResultWithExtras = SearchResult & {
  videos?: number;
  playlistType?: string;
  subCount?: number | string;
};

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

function formatMetric(
  value: number | string | undefined,
  suffix: string
): string | undefined {
  if (value == null || value === 0 || value === "0") return undefined;

  const raw = String(value).trim();
  if (!raw) return undefined;
  if (new RegExp(`\\b${suffix}\\b`, "i").test(raw)) return raw;
  if (/^\d+$/.test(raw)) return `${shortCount(raw)} ${suffix}`;
  return `${raw} ${suffix}`;
}

export const ResultItem = memo<ResultItemProps>(({ item, onPress }) => {
  const itemWithExtras = item as SearchResultWithExtras;
  const isArtist = item.type === "artist" || item.type === "channel";
  const isYouTubeSource =
    item.source === "youtube" || item.source === "youtubemusic";
  const hideViewsAndDateForYouTubeMusic =
    item.source === "youtubemusic" &&
    (item.type === "song" || item.type === "video" || item.type === "stream");

  // YouTube mix detection
  const isYouTubeMixPlaylist =
    item.type === "playlist" &&
    isYouTubeSource &&
    (itemWithExtras.videos === -2 ||
      itemWithExtras.playlistType === "MIX_STREAM");

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
    !isArtist && !hideViewsAndDateForYouTubeMusic
      ? formatMetric(item.views, "views")
      : undefined;

  const uploadedLabel =
    !isArtist && !hideViewsAndDateForYouTubeMusic && item.uploaded
      ? item.uploaded
      : undefined;

  const subCountLabel = isArtist
    ? formatSubscribers(itemWithExtras.subCount, item.source)
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
    <div className="flex py-2.5 rounded-lg">
      <button
        type="button"
        onClick={onPress}
        className="mr-3 shrink-0 rounded-xl focus:outline-none focus-visible:ring-2 focus-visible:ring-white/70"
        aria-label={`Open ${displayTitle}`}
      >
        {thumbnail ? (
          <Image
            src={thumbnail}
            alt=""
            width={imgWidth}
            height={imgHeight}
            className={thumbnailClasses.replace(" mr-3", "")}
            unoptimized
          />
        ) : (
          <div className={placeholderClasses.replace(" mr-3", "")} />
        )}
      </button>

      <div className="min-w-0 flex-1">
        {/* Channel / Artist name */}
        <h3 className="truncate text-white font-medium">
          <button
            type="button"
            onClick={onPress}
            className="truncate text-left transition hover:underline focus:outline-none focus-visible:underline"
          >
            {displayTitle}
          </button>
        </h3>

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
            {uploadedLabel && (
              <>
                <span className="w-1 h-1 rounded-full bg-neutral-600" />
                <span>{uploadedLabel}</span>
              </>
            )}
          </div>
        )}
      </div>
    </div>
  );
});

ResultItem.displayName = "ResultItem";
