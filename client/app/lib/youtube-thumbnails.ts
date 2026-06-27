const YOUTUBE_IMAGE_BASE = "https://i.ytimg.com";
const DEFAULT_THUMBNAIL_VARIANT = "maxresdefault.jpg";
type YouTubeThumbnailOutput =
  | "jpg"
  | "jxl"
  | "png"
  | "gif"
  | "tiff"
  | "webp"
  | "json";

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

function normalizePositiveInt(value: number | null | undefined): string | null {
  if (!Number.isFinite(value) || !value || value <= 0) return null;
  return String(Math.floor(value));
}

function normalizeQuality(value: number | null | undefined): string | null {
  if (!Number.isFinite(value) || !value) return null;
  const quality = Math.max(1, Math.min(100, Math.round(value)));
  return String(quality);
}

function buildYouTubeThumbnailApiUrl(
  videoId: string,
  options: {
    variant: string;
    useWebp: boolean;
    width?: number;
    height?: number;
    fit?: string;
    alignment?: string;
    trim?: string | number;
    output?: YouTubeThumbnailOutput;
    quality?: number;
  }
): string {
  const params = new URLSearchParams({
    id: videoId,
    variant: options.variant,
  });
  const width = normalizePositiveInt(options.width);
  const height = normalizePositiveInt(options.height);
  const quality = normalizeQuality(options.quality);

  if (options.useWebp) {
    params.set("webp", "1");
  }
  if (width) {
    params.set("w", width);
  }
  if (height) {
    params.set("h", height);
  }
  if (options.fit?.trim()) {
    params.set("fit", options.fit.trim());
  }
  if (options.alignment?.trim()) {
    params.set("a", options.alignment.trim());
  }
  if (options.trim != null && String(options.trim).trim()) {
    params.set("trim", String(options.trim).trim());
  }
  if (options.output?.trim()) {
    params.set("output", options.output.trim());
  }
  if (quality) {
    params.set("q", quality);
  }
  return `/api/youtube-thumbnail?${params.toString()}`;
}

export function normalizeYouTubeThumbnailUrl(input: {
  url?: string | null;
  videoId?: string | null;
  variant?: string;
  width?: number;
  height?: number;
  fit?: string;
  alignment?: string;
  trim?: string | number;
  output?: YouTubeThumbnailOutput;
  quality?: number;
}): string | undefined {
  const cleanedUrl = cleanValue(input.url);
  const videoId =
    extractYouTubeVideoId(input.videoId) || extractYouTubeVideoId(cleanedUrl);

  if (videoId) {
    const thumbnailDetails = extractYouTubeThumbnailDetails(cleanedUrl);
    return buildYouTubeThumbnailApiUrl(videoId, {
      variant:
        input.variant || DEFAULT_THUMBNAIL_VARIANT || thumbnailDetails.variant,
      useWebp: thumbnailDetails.useWebp,
      width: input.width,
      height: input.height,
      fit: input.fit,
      alignment: input.alignment,
      trim: input.trim,
      output: input.output,
      quality: input.quality,
    });
  }

  return cleanedUrl || undefined;
}
