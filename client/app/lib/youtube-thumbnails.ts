const YOUTUBE_IMAGE_BASE = "https://i.ytimg.com";
const DEFAULT_THUMBNAIL_VARIANT = "hqdefault.jpg";

function cleanValue(value: string | null | undefined): string {
  return (value || "").trim().replace(/^["'`]+|["'`]+$/g, "");
}

export function extractYouTubeVideoId(
  value: string | null | undefined
): string {
  const rawValue = cleanValue(value);
  if (!rawValue) return "";

  const thumbnailMatch = rawValue.match(/\/vi(?:_webp)?\/([^/?#]+)\//i);
  if (thumbnailMatch?.[1]) {
    return decodeURIComponent(thumbnailMatch[1]);
  }

  const watchMatch = rawValue.match(/[?&]v=([^&]+)/i);
  if (watchMatch?.[1]) {
    return decodeURIComponent(watchMatch[1]);
  }

  const shortMatch = rawValue.match(/youtu\.be\/([^/?#]+)/i);
  if (shortMatch?.[1]) {
    return decodeURIComponent(shortMatch[1]);
  }

  const embedMatch = rawValue.match(/\/embed\/([^/?#]+)/i);
  if (embedMatch?.[1]) {
    return decodeURIComponent(embedMatch[1]);
  }

  if (/^[a-zA-Z0-9_-]{6,}$/.test(rawValue)) {
    return rawValue;
  }

  return "";
}

export function buildYouTubeThumbnailUrl(
  videoId: string,
  variant = DEFAULT_THUMBNAIL_VARIANT,
  useWebp = false
): string {
  const thumbnailPath = useWebp ? "vi_webp" : "vi";
  return `${YOUTUBE_IMAGE_BASE}/${thumbnailPath}/${encodeURIComponent(
    videoId
  )}/${variant}`;
}

function extractYouTubeThumbnailDetails(value: string): {
  variant?: string;
  useWebp: boolean;
} {
  const rawValue = cleanValue(value);
  const match = rawValue.match(
    /\/(vi|vi_webp)\/[^/?#]+\/([^/?#]+(?:\.[a-z0-9]+)?)/i
  );

  if (!match) {
    return { useWebp: false };
  }

  return {
    variant: match[2] || undefined,
    useWebp: match[1]?.toLowerCase() === "vi_webp",
  };
}

function buildYouTubeThumbnailApiUrl(
  videoId: string,
  variant: string,
  useWebp: boolean
): string {
  const params = new URLSearchParams({
    id: videoId,
    variant,
  });
  if (useWebp) {
    params.set("webp", "1");
  }
  return `/api/youtube-thumbnail?${params.toString()}`;
}

export function normalizeYouTubeThumbnailUrl(input: {
  url?: string | null;
  videoId?: string | null;
  variant?: string;
}): string | undefined {
  const cleanedUrl = cleanValue(input.url);
  const videoId =
    extractYouTubeVideoId(input.videoId) || extractYouTubeVideoId(cleanedUrl);

  if (videoId) {
    const thumbnailDetails = extractYouTubeThumbnailDetails(cleanedUrl);
    return buildYouTubeThumbnailApiUrl(
      videoId,
      input.variant || thumbnailDetails.variant || DEFAULT_THUMBNAIL_VARIANT,
      thumbnailDetails.useWebp
    );
  }

  return cleanedUrl || undefined;
}
