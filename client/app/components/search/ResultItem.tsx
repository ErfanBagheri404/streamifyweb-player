import React, { memo } from "react";
import { SearchResult } from "./types";
import { formatDuration, shortCount } from "./helpers";
import Image from "next/image";
import { useAppLanguage } from "../../hooks/useAppLanguage";

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
    return formatted;
  }
  return formatted;
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
  const { t } = useAppLanguage();
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

  const rawSubCountLabel = isArtist
    ? formatSubscribers(itemWithExtras.subCount, item.source)
    : "";
  const subCountLabel = rawSubCountLabel
    ? item.source === "soundcloud" || item.source === "jiosaavn"
      ? t("search.listeners", { count: rawSubCountLabel })
      : t("search.subscribers", { count: rawSubCountLabel })
    : "";
  // Thumbnail styling
  const thumbnailClasses = isArtist
    ? "h-12 w-12 rounded-full object-cover"
    : isYouTubeSource
    ? "h-36 w-64 rounded-xl object-cover"
    : "h-32 w-32 rounded-xl object-cover";

  const placeholderClasses = isArtist
    ? "h-12 w-12 rounded-full bg-neutral-700"
    : isYouTubeSource
    ? "h-36 w-64 rounded-xl bg-neutral-700"
    : "h-32 w-32 rounded-xl bg-neutral-700";

  const imgWidth = isArtist ? 48 : isYouTubeSource ? 256 : 64;
  const imgHeight = isArtist ? 48 : isYouTubeSource ? 144 : 64;

  return (
    <div className="flex items-start gap-3 rounded-lg py-2.5">
      <button
        type="button"
        onClick={onPress}
        className="shrink-0 rounded-xl focus:outline-none focus-visible:ring-2 focus-visible:ring-white/70"
        aria-label={t("search.open", { title: displayTitle })}
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
      </button>

      <div className="min-w-0 flex-1">
        {/* Channel / Artist name */}
        <h3 className="truncate text-start font-medium text-white">
          <button
            type="button"
            onClick={onPress}
            className="block max-w-full truncate text-start transition hover:underline focus:outline-none focus-visible:underline"
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
          <div className="flex flex-wrap items-center gap-x-2 gap-y-1 text-xs text-neutral-500">
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
