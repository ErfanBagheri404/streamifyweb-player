import { buildProviderUrlCandidates, type WorkerConfig } from "../config";
import {
  absolutizeUrl,
  buildWorkerUrl,
  json,
  parseJsonText,
  toArray,
  toNumber,
  toRecord,
  withTimeout,
} from "../http";

const USER_AGENT =
  "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36";
const CACHE_TTL_MS = 5 * 60 * 1000;
const INVIDIOUS_TIMEOUT_MS = 10000;
const PIPED_TIMEOUT_MS = 7000;

const responseCache = new Map<
  string,
  { at: number; value: Record<string, unknown> }
>();
let soundCloudClientId: string | null = null;

function isAudioMime(value: unknown): boolean {
  return typeof value === "string" && value.includes("audio/");
}

function extractYouTubeVideoId(value: string | null | undefined): string {
  const rawValue = (value || "").trim();
  if (!rawValue) return "";

  const watchMatch = rawValue.match(/[?&]v=([^&]+)/i);
  if (watchMatch?.[1]) return decodeURIComponent(watchMatch[1]);
  const shortMatch = rawValue.match(/youtu\.be\/([^/?#]+)/i);
  if (shortMatch?.[1]) return decodeURIComponent(shortMatch[1]);
  const thumbMatch = rawValue.match(/\/vi(?:_webp)?\/([^/?#]+)\//i);
  if (thumbMatch?.[1]) return decodeURIComponent(thumbMatch[1]);
  return /^[a-zA-Z0-9_-]{6,}$/.test(rawValue) ? rawValue : "";
}

function buildYouTubeThumbnailUrl(
  config: WorkerConfig,
  videoId: string,
  variant = "hqdefault.jpg"
): string {
  return `${config.providers.youtube.imageBase}/vi/${encodeURIComponent(
    videoId
  )}/${variant}`;
}

async function fetchJson(
  url: string,
  signal: AbortSignal | undefined,
  timeoutMs: number
): Promise<unknown> {
  const response = await fetch(url, {
    headers: {
      "User-Agent": USER_AGENT,
      Accept: "application/json, text/plain;q=0.9, */*;q=0.8",
      "Accept-Language": "en-US,en;q=0.9",
      "Cache-Control": "no-cache",
      Pragma: "no-cache",
    },
    signal: withTimeout(signal, timeoutMs),
  });

  const text = await response.text();
  if (!response.ok) {
    throw new Error(
      `HTTP ${response.status}${text ? `: ${text.slice(0, 160)}` : ""}`
    );
  }

  return parseJsonText(text);
}

function buildDirectProxyAudioUrl(
  request: Request,
  streamUrl: string | null
): string | null {
  if (!streamUrl) return null;
  return buildWorkerUrl(request, "/audio-proxy", { url: streamUrl });
}

function buildSoundCloudWidevineLicenseUrl(
  licenseBase: string,
  licenseAuthToken: string
): string {
  return (
    buildProviderUrlCandidates(licenseBase, ["/playback/widevine"], {
      license_token: licenseAuthToken,
    })[0] || ""
  );
}

function buildInvidiousRelayUrl(
  streamUrl: string,
  base: string
): string | null {
  try {
    const resolvedStreamUrl = new URL(streamUrl, base);
    const providerBaseUrl = new URL(base);

    if (!/googlevideo\.com$/i.test(resolvedStreamUrl.hostname)) {
      return null;
    }

    providerBaseUrl.pathname = resolvedStreamUrl.pathname;
    providerBaseUrl.search = resolvedStreamUrl.search;
    providerBaseUrl.hash = "";
    return providerBaseUrl.toString();
  } catch {
    return null;
  }
}

function buildPlayableAudioUrl(
  request: Request,
  streamUrl: string | null,
  base: string
): string | null {
  if (!streamUrl) return null;
  const resolvedStreamUrl = absolutizeUrl(streamUrl, base);
  const relayUrl = buildInvidiousRelayUrl(resolvedStreamUrl, base);
  if (relayUrl) return relayUrl;
  return buildDirectProxyAudioUrl(request, resolvedStreamUrl);
}

function pickBestStreamUrl(
  candidates: unknown[],
  base?: string
): string | null {
  const audioCandidates = toArray(candidates)
    .filter((entry) => typeof toRecord(entry).url === "string")
    .filter((entry) => {
      const record = toRecord(entry);
      return (
        isAudioMime(record.type) ||
        isAudioMime(record.mimeType) ||
        Boolean(record.audioCodec)
      );
    })
    .sort(
      (left, right) =>
        (toNumber(toRecord(right).bitrate) ?? 0) -
        (toNumber(toRecord(left).bitrate) ?? 0)
    );

  const preferred =
    audioCandidates.find((entry) =>
      String(toRecord(entry).type || toRecord(entry).mimeType || "").includes(
        "mp4"
      )
    ) ||
    audioCandidates.find((entry) =>
      String(toRecord(entry).type || toRecord(entry).mimeType || "").includes(
        "opus"
      )
    ) ||
    audioCandidates[0];

  const raw =
    typeof toRecord(preferred).url === "string"
      ? String(toRecord(preferred).url)
      : "";
  if (!raw) return null;
  return base ? absolutizeUrl(raw, base) : raw;
}

function pickThumbnailUrl(
  config: WorkerConfig,
  record: Record<string, any>,
  base: string
): string {
  const rawUrl =
    typeof record.url === "string"
      ? record.url
      : typeof record.videoUrl === "string"
      ? record.videoUrl
      : "";
  const videoId =
    typeof record.videoId === "string"
      ? record.videoId
      : typeof record.id === "string"
      ? record.id
      : extractYouTubeVideoId(rawUrl);
  const directThumbnail =
    typeof record.thumbnailUrl === "string"
      ? record.thumbnailUrl
      : typeof record.thumbnail === "string"
      ? record.thumbnail
      : "";

  if (directThumbnail) {
    return absolutizeUrl(directThumbnail, base);
  }

  const thumbs = toArray(record.videoThumbnails)
    .map((entry) => toRecord(entry))
    .sort((left, right) => {
      const leftScore =
        (toNumber(left.width) ?? 0) * (toNumber(left.height) ?? 0);
      const rightScore =
        (toNumber(right.width) ?? 0) * (toNumber(right.height) ?? 0);
      return rightScore - leftScore;
    });

  const thumbnailUrl = absolutizeUrl(String(thumbs[0]?.url || ""), base);
  return (
    thumbnailUrl || (videoId ? buildYouTubeThumbnailUrl(config, videoId) : "")
  );
}

function extractChannelIdFromUrl(value: string): string {
  const rawValue = value.trim().replace(/^\/+/, "");
  if (!rawValue) return "";

  const channelMatch = rawValue.match(/^channel\/([^/?#]+)/i);
  if (channelMatch?.[1]) return channelMatch[1];

  if (/^https?:\/\//i.test(rawValue)) {
    try {
      const parsed = new URL(rawValue);
      return extractChannelIdFromUrl(parsed.pathname);
    } catch {
      return "";
    }
  }

  return "";
}

function normalizeRelatedSongs(
  config: WorkerConfig,
  value: unknown,
  base: string,
  source: string
): Array<Record<string, unknown>> {
  const seen = new Set<string>();
  const results: Array<Record<string, unknown>> = [];

  for (const entry of toArray(value)) {
    const record = toRecord(entry);
    const rawUrl =
      typeof record.url === "string"
        ? record.url
        : typeof record.videoUrl === "string"
        ? record.videoUrl
        : "";
    const id =
      typeof record.videoId === "string"
        ? record.videoId
        : typeof record.id === "string"
        ? record.id
        : extractYouTubeVideoId(rawUrl);
    const title =
      typeof record.title === "string"
        ? record.title
        : typeof record.name === "string"
        ? record.name
        : "";

    if (!id || !title || seen.has(id)) {
      continue;
    }
    seen.add(id);

    results.push({
      id,
      title,
      artist:
        typeof record.author === "string"
          ? record.author
          : typeof record.uploaderName === "string"
          ? record.uploaderName
          : typeof record.uploader === "string"
          ? record.uploader
          : "Unknown Artist",
      artistId:
        typeof record.authorId === "string"
          ? record.authorId
          : extractChannelIdFromUrl(
              typeof record.uploaderUrl === "string" ? record.uploaderUrl : ""
            ) || undefined,
      artistImage:
        typeof record.uploaderAvatar === "string"
          ? absolutizeUrl(record.uploaderAvatar, base)
          : undefined,
      coverUrl: pickThumbnailUrl(config, record, base),
      duration:
        toNumber(record.lengthSeconds) ??
        toNumber(record.duration) ??
        toNumber(record.durationSeconds),
      source,
      url: rawUrl ? absolutizeUrl(rawUrl, base) : `/watch?v=${id}`,
    });
  }

  return results;
}

function normalizeVideoPayload(
  config: WorkerConfig,
  request: Request,
  data: unknown,
  base: string,
  source = "youtube"
): Record<string, unknown> | null {
  const record = toRecord(data);
  const adaptiveFormats = toArray(record.adaptiveFormats);
  const audioStreams = toArray(record.audioStreams);
  const formatStreams = toArray(record.formatStreams);
  const directAudioUrl =
    typeof record.audioUrl === "string" ? record.audioUrl : null;

  const preferredUrl =
    directAudioUrl ||
    pickBestStreamUrl([...adaptiveFormats, ...audioStreams], base) ||
    pickBestStreamUrl(formatStreams, base);
  const videoId =
    typeof record.videoId === "string"
      ? record.videoId
      : typeof record.id === "string"
      ? record.id
      : extractYouTubeVideoId(typeof record.url === "string" ? record.url : "");
  const thumbnailUrl = pickThumbnailUrl(config, record, base);
  const audioUrl = buildPlayableAudioUrl(request, preferredUrl, base);

  if (
    !audioUrl &&
    !record.title &&
    !record.name &&
    !record.videoId &&
    !record.id
  ) {
    return null;
  }

  return {
    id: record.videoId || record.id,
    title: record.title || record.name,
    author: record.author || record.uploader || record.uploaderName,
    lengthSeconds:
      toNumber(record.lengthSeconds) ??
      toNumber(record.duration) ??
      toNumber(record.durationSeconds),
    adaptiveFormats:
      adaptiveFormats.length > 0
        ? adaptiveFormats
        : audioStreams.length > 0
        ? audioStreams
        : undefined,
    audioUrl,
    thumbnailUrl:
      thumbnailUrl ||
      (videoId
        ? buildYouTubeThumbnailUrl(config, videoId, "maxresdefault.jpg")
        : ""),
    relatedSongs: normalizeRelatedSongs(
      config,
      record.recommendedVideos || record.relatedStreams,
      base,
      source
    ),
    source,
  };
}

async function fetchVideoFromInvidious(
  config: WorkerConfig,
  request: Request,
  instance: string,
  videoId: string,
  source?: string,
  signal?: AbortSignal
): Promise<Record<string, unknown>> {
  const base = instance.replace(/\/+$/, "");
  const data = await fetchJson(
    `${base}/api/v1/videos/${videoId}`,
    signal,
    INVIDIOUS_TIMEOUT_MS
  );
  const normalized = normalizeVideoPayload(config, request, data, base, source);
  if (!normalized?.audioUrl) {
    throw new Error(
      "Invidious response did not include a playable audio stream"
    );
  }
  return normalized;
}

async function fetchVideoFromPiped(
  config: WorkerConfig,
  request: Request,
  instance: string,
  videoId: string,
  source?: string,
  signal?: AbortSignal
): Promise<Record<string, unknown>> {
  const base = instance.replace(/\/+$/, "");
  const data = await fetchJson(
    `${base}/streams/${videoId}`,
    signal,
    PIPED_TIMEOUT_MS
  );
  const normalized = normalizeVideoPayload(config, request, data, base, source);
  if (!normalized?.audioUrl) {
    throw new Error("Piped response did not include a playable audio stream");
  }
  return normalized;
}

function isSoundCloudEncryptedStreamUrl(streamUrl: string): boolean {
  try {
    return /\/(cbcs|cenc)\//i.test(new URL(streamUrl).pathname);
  } catch {
    return false;
  }
}

async function fetchTextWithHeaders(
  url: string,
  headers: Record<string, string>,
  timeoutMs: number
): Promise<string> {
  const response = await fetch(url, {
    headers,
    signal: withTimeout(undefined, timeoutMs),
  });
  const text = await response.text();
  if (!response.ok) {
    throw new Error(
      `HTTP ${response.status}${text ? `: ${text.slice(0, 160)}` : ""}`
    );
  }
  return text;
}

async function getSoundCloudClientId(
  config: WorkerConfig,
  reset = false
): Promise<string> {
  if (soundCloudClientId && !reset) return soundCloudClientId;

  const soundcloud = config.providers.soundcloud;

  try {
    const oembedUrls = buildProviderUrlCandidates(
      soundcloud.oembedBase,
      ["/oembed"],
      {
        url: `${soundcloud.origin}/lil-durk/back-again`,
      }
    );
    for (const apiUrl of oembedUrls) {
      const oembedResponse = await fetchTextWithHeaders(
        apiUrl,
        {
          "User-Agent": USER_AGENT,
          Referer: `${soundcloud.origin}/`,
          Origin: soundcloud.origin,
        },
        12000
      );
      const match = oembedResponse.match(/client_id["\s:]+([a-zA-Z0-9]+)/);
      if (match?.[1]) {
        soundCloudClientId = match[1];
        return soundCloudClientId;
      }
    }
  } catch {}

  try {
    const desktopHtml = await fetchTextWithHeaders(
      soundcloud.origin,
      {
        "User-Agent": USER_AGENT,
        Referer: `${soundcloud.origin}/`,
        Origin: soundcloud.origin,
      },
      12000
    );
    const scriptUrls = desktopHtml.match(/https?:\/\/[^\s"]+\.js/g) || [];
    for (const scriptUrl of scriptUrls) {
      try {
        const script = await fetchTextWithHeaders(
          scriptUrl,
          { "User-Agent": USER_AGENT, Referer: `${soundcloud.origin}/` },
          12000
        );
        const match = script.match(/[{,]client_id:"(\w+)"/);
        if (match?.[1]) {
          soundCloudClientId = match[1];
          return soundCloudClientId;
        }
      } catch {}
    }
  } catch {}

  try {
    const mobileHtml = await fetchTextWithHeaders(
      `${soundcloud.mobileOrigin}/`,
      {
        "User-Agent":
          "Mozilla/5.0 (iPhone; CPU iPhone OS 16_5_1 like Mac OS X) AppleWebKit/605.1.15 (KHTML, like Gecko) CriOS/99.0.4844.47 Mobile/15E148 Safari/604.1",
      },
      12000
    );
    const mobileMatch = mobileHtml.match(/"clientId":"(\w+?)"/);
    if (mobileMatch?.[1]) {
      soundCloudClientId = mobileMatch[1];
      return soundCloudClientId;
    }
  } catch {}

  if (soundcloud.clientId) {
    soundCloudClientId = soundcloud.clientId;
    return soundCloudClientId;
  }

  throw new Error("Failed to resolve SoundCloud client id from runtime config");
}

async function fetchSoundCloudJson(
  config: WorkerConfig,
  url: string
): Promise<unknown> {
  const clientId = await getSoundCloudClientId(config);
  const requestUrl = `${url}${
    url.includes("?") ? "&" : "?"
  }client_id=${clientId}`;

  try {
    return await fetchJson(requestUrl, undefined, 12000);
  } catch {
    const fallbackClientId = await getSoundCloudClientId(config, true);
    const fallbackUrl = `${url}${
      url.includes("?") ? "&" : "?"
    }client_id=${fallbackClientId}`;
    return fetchJson(fallbackUrl, undefined, 12000);
  }
}

function normalizeSoundCloudUrlHint(urlHint?: string): string | undefined {
  if (!urlHint) return undefined;
  try {
    const parsed = new URL(urlHint);
    if (
      parsed.hostname === "w.soundcloud.com" &&
      parsed.pathname === "/player/"
    ) {
      const embeddedUrl = parsed.searchParams.get("url");
      if (embeddedUrl) return embeddedUrl;
    }
    return parsed.toString();
  } catch {
    return urlHint;
  }
}

function extractSoundCloudTrackId(value?: string): string | undefined {
  if (!value) return undefined;
  const trackRefMatch = value.match(/soundcloud:tracks:(\d+)/i);
  if (trackRefMatch?.[1]) return trackRefMatch[1];
  const apiTrackMatch = value.match(/api\.soundcloud\.com\/tracks\/(\d+)/i);
  if (apiTrackMatch?.[1]) return apiTrackMatch[1];
  const apiV2TrackMatch = value.match(
    /api-v2\.soundcloud\.com\/tracks\/(\d+)/i
  );
  if (apiV2TrackMatch?.[1]) return apiV2TrackMatch[1];
  return undefined;
}

function soundCloudTranscodingScore(entry: Record<string, any>): number {
  const format = toRecord(entry.format);
  const protocol = String(format.protocol || "").toLowerCase();
  const mimeType = String(format.mime_type || "").toLowerCase();
  let score = 0;
  if (protocol === "progressive") score += 100;
  if (protocol === "ctr-encrypted-hls") score += 90;
  if (protocol === "cbc-encrypted-hls") score += 80;
  if (protocol.includes("encrypted")) score += 20;
  if (protocol === "hls") score += 10;
  if (!entry.is_legacy_transcoding) score += 5;
  if (mimeType.includes("audio/mp4")) score += 2;
  if (String(entry.quality || "").toLowerCase() === "sq") score += 1;
  return score;
}

async function fetchSoundCloudStreamPayload(
  config: WorkerConfig,
  transcodings: Record<string, any>[],
  trackAuthorization: string | null
): Promise<{
  streamPayload: Record<string, any>;
  transcoding: Record<string, any>;
}> {
  const candidates = [...transcodings].sort(
    (left, right) =>
      soundCloudTranscodingScore(right) - soundCloudTranscodingScore(left)
  );

  for (const candidate of candidates) {
    const transcodingUrl =
      typeof candidate.url === "string" ? candidate.url : undefined;
    if (!transcodingUrl) continue;

    const requestUrl = new URL(transcodingUrl);
    if (trackAuthorization) {
      requestUrl.searchParams.set("track_authorization", trackAuthorization);
    }

    const streamPayload = toRecord(
      await fetchSoundCloudJson(config, requestUrl.toString())
    );
    if (typeof streamPayload.url === "string" && streamPayload.url) {
      return { streamPayload, transcoding: candidate };
    }
  }

  throw new Error("SoundCloud stream URL lookup failed");
}

async function fetchSoundCloudDetails(
  request: Request,
  config: WorkerConfig,
  id: string,
  urlHint?: string
): Promise<Record<string, unknown>> {
  const soundcloud = config.providers.soundcloud;
  const normalizedUrlHint = normalizeSoundCloudUrlHint(urlHint);
  const hintedTrackId = extractSoundCloudTrackId(normalizedUrlHint);
  const resolvedTrackId = hintedTrackId || id;
  const payload = normalizedUrlHint
    ? await fetchSoundCloudJson(
        config,
        buildProviderUrlCandidates(soundcloud.apiV2Base, ["/resolve"], {
          url: normalizedUrlHint,
        })[0] || ""
      )
    : await fetchSoundCloudJson(
        config,
        buildProviderUrlCandidates(soundcloud.apiV2Base, [
          `/tracks/${encodeURIComponent(resolvedTrackId)}`,
        ])[0] || ""
      );

  const track = toRecord(payload);
  if (!track.id) {
    throw new Error("SoundCloud track could not be resolved");
  }

  const transcodings = toArray(toRecord(track.media).transcodings).map(
    (entry) => toRecord(entry)
  );
  if (!transcodings.length) {
    throw new Error("SoundCloud track did not expose a playable transcoding");
  }

  const trackAuthorization =
    typeof track.track_authorization === "string"
      ? track.track_authorization
      : null;
  const { streamPayload } = await fetchSoundCloudStreamPayload(
    config,
    transcodings,
    trackAuthorization
  );
  const streamUrl =
    typeof streamPayload.url === "string" ? streamPayload.url : null;
  if (!streamUrl) {
    throw new Error("SoundCloud stream URL lookup failed");
  }

  const widgetTrackUrl =
    typeof track.permalink_url === "string" && track.permalink_url.trim()
      ? track.permalink_url
      : normalizedUrlHint ||
        `${soundcloud.apiBase}/tracks/${encodeURIComponent(String(track.id))}`;

  if (isSoundCloudEncryptedStreamUrl(streamUrl)) {
    const licenseAuthToken =
      typeof streamPayload.licenseAuthToken === "string"
        ? streamPayload.licenseAuthToken
        : null;
    if (!licenseAuthToken) {
      throw new Error(
        "SoundCloud encrypted stream did not include a licenseAuthToken"
      );
    }

    return {
      id: track.id,
      title: track.title,
      author: toRecord(track.user).username,
      lengthSeconds: Math.floor((toNumber(track.duration) ?? 0) / 1000),
      thumbnailUrl: track.artwork_url || toRecord(track.user).avatar_url,
      url: widgetTrackUrl,
      audioType: "soundcloud-drm",
      audioUrl: streamUrl,
      drmLicenseUrl: buildSoundCloudWidevineLicenseUrl(
        soundcloud.licenseBase,
        licenseAuthToken
      ),
      drmScheme: "com.widevine.alpha",
      drmProvider: "soundcloud",
      drmHeaders: {
        "Content-Type": "application/octet-stream",
      },
      playbackStrategy: "widget",
      source: "soundcloud",
    };
  }

  return {
    id: track.id,
    title: track.title,
    author: toRecord(track.user).username,
    lengthSeconds: Math.floor((toNumber(track.duration) ?? 0) / 1000),
    thumbnailUrl: track.artwork_url || toRecord(track.user).avatar_url,
    url: widgetTrackUrl,
    source: "soundcloud",
    audioUrl: buildDirectProxyAudioUrl(request, streamUrl),
    playbackStrategy: "widget",
  };
}

function pickArrayString(entry: unknown, keys: string[]): string | undefined {
  const record = toRecord(entry);
  for (const key of keys) {
    const value = record[key];
    if (typeof value === "string" && value.trim()) return value;
  }
  return undefined;
}

function qualityScore(value: unknown): number {
  if (typeof value === "number" && Number.isFinite(value)) return value;
  if (typeof value === "string") {
    const match = value.match(/(\d+)/);
    if (match) return Number(match[1]);
  }
  return 0;
}

function getJioSaavnRecords(payload: unknown): Record<string, any>[] {
  const queue: unknown[] = [payload];
  const records: Record<string, any>[] = [];
  const seen = new Set<unknown>();

  while (queue.length > 0) {
    const current = queue.shift();
    if (!current || seen.has(current)) continue;
    seen.add(current);

    if (Array.isArray(current)) {
      queue.push(...current);
      continue;
    }

    const record = toRecord(current);
    if (!Object.keys(record).length) continue;
    records.push(record);
    queue.push(
      record.data,
      record.song,
      record.songs,
      record.results,
      record.more_info
    );
  }

  return records;
}

function pickJioSaavnImage(value: unknown): string | undefined {
  return (
    toArray(value)
      .map((entry) => toRecord(entry))
      .sort(
        (left, right) =>
          qualityScore(right.quality || right.size) -
          qualityScore(left.quality || left.size)
      )
      .map((entry) => pickArrayString(entry, ["url", "link"]))
      .find(Boolean) || undefined
  );
}

function pickJioSaavnArtistNames(
  record: Record<string, any>
): string | undefined {
  const direct = pickArrayString(record, [
    "primary_artists",
    "primaryArtists",
    "singers",
    "artist",
    "subtitle",
  ]);
  if (direct) return direct;

  const artists = toRecord(record.artists);
  const groups = [artists.primary, artists.featured, artists.all];

  for (const group of groups) {
    const names = toArray(group)
      .map((entry) => pickArrayString(entry, ["name"]))
      .filter(Boolean);
    if (names.length) return names.join(", ");
  }
  return undefined;
}

function extractJioSaavnAudioUrl(payload: unknown): string | null {
  for (const record of getJioSaavnRecords(payload)) {
    const arrays = [
      record.downloadUrl,
      record.download_url,
      toRecord(record.more_info).encrypted_media_url,
    ];
    for (const entry of arrays) {
      const best = toArray(entry)
        .map((item) => toRecord(item))
        .sort(
          (left, right) =>
            qualityScore(right.quality || right.bitrate || right.kbps) -
            qualityScore(left.quality || left.bitrate || left.kbps)
        )
        .map((item) =>
          pickArrayString(item, ["url", "link", "downloadUrl", "download_url"])
        )
        .find(Boolean);
      if (best) return best;
    }

    const directUrl = pickArrayString(record, [
      "media_url",
      "mediaUrl",
      "url",
      "vlink",
      "preview_url",
    ]);
    if (directUrl && /^https?:\/\//i.test(directUrl)) return directUrl;
  }

  return null;
}

function normalizeJioSaavnPayload(
  request: Request,
  payload: unknown
): Record<string, unknown> | null {
  const records = getJioSaavnRecords(payload);
  const root =
    records.find(
      (record) =>
        Array.isArray(record.downloadUrl) ||
        Array.isArray(record.download_url) ||
        Boolean(
          pickArrayString(record, [
            "name",
            "title",
            "song",
            "primaryArtists",
            "primary_artists",
          ])
        )
    ) || toRecord(payload);
  const moreInfo = toRecord(root.more_info);
  const audioStream = extractJioSaavnAudioUrl(payload);
  if (!audioStream) return null;

  const image =
    pickJioSaavnImage(root.image) ||
    pickArrayString(root, ["thumbnailUrl", "thumbnail"]) ||
    pickJioSaavnImage(moreInfo.image) ||
    pickArrayString(moreInfo, ["thumbnailUrl", "thumbnail"]);

  return {
    id: root.id || root.songid || root.url,
    title: root.song || root.title || root.name,
    author: pickJioSaavnArtistNames(root) || pickJioSaavnArtistNames(moreInfo),
    lengthSeconds: toNumber(root.duration) ?? toNumber(moreInfo.duration),
    thumbnailUrl: image,
    url:
      pickArrayString(root, ["url", "perma_url", "permaUrl", "permalink"]) ||
      pickArrayString(moreInfo, ["url", "perma_url", "permaUrl", "permalink"]),
    audioUrl: buildDirectProxyAudioUrl(request, audioStream),
    source: "jiosaavn",
  };
}

function buildJioSaavnSongEndpoints(
  id: string,
  apiBase: string,
  urlHint?: string
): string[] {
  const candidates = new Set<string>();
  const addId = (value?: string) => {
    if (!value) return;
    buildProviderUrlCandidates(apiBase, [
      `/api/songs/${encodeURIComponent(value)}`,
      `/songs/${encodeURIComponent(value)}`,
    ]).forEach((candidate) => candidates.add(candidate));
    buildProviderUrlCandidates(apiBase, ["/api/songs", "/songs"], {
      ids: value,
    }).forEach((candidate) => candidates.add(candidate));
  };
  const addLink = (value?: string) => {
    if (!value) return;
    buildProviderUrlCandidates(apiBase, ["/api/songs", "/songs"], {
      link: value,
    }).forEach((candidate) => candidates.add(candidate));
  };

  addId(id);
  if (urlHint) {
    addLink(urlHint);
    try {
      const parsed = new URL(urlHint);
      const token = parsed.pathname.split("/").filter(Boolean).pop();
      addId(token);
    } catch {
      addId(urlHint);
    }
  }

  return [...candidates];
}

async function fetchJioSaavnFromEndpoints(
  request: Request,
  endpoints: string[]
): Promise<Record<string, unknown> | null> {
  for (const endpoint of endpoints) {
    try {
      const payload = await fetchJson(endpoint, undefined, 12000);
      const normalized = normalizeJioSaavnPayload(request, payload);
      if (normalized?.audioUrl) return normalized;
    } catch {}
  }
  return null;
}

async function fetchVideoDetails(
  request: Request,
  config: WorkerConfig,
  videoId: string,
  source?: string,
  options?: {
    urlHint?: string;
  }
): Promise<Record<string, unknown>> {
  if (source === "youtube" || source === "youtubemusic" || !source) {
    const providers = [
      ...config.instances.invidious.map((instance) => ({
        run: (signal?: AbortSignal) =>
          fetchVideoFromInvidious(
            config,
            request,
            instance,
            videoId,
            source,
            signal
          ),
      })),
      ...config.instances.piped.map((instance) => ({
        run: (signal?: AbortSignal) =>
          fetchVideoFromPiped(
            config,
            request,
            instance,
            videoId,
            source,
            signal
          ),
      })),
    ];

    const errors: string[] = [];
    for (const provider of providers) {
      try {
        return await provider.run();
      } catch (error) {
        errors.push(error instanceof Error ? error.message : String(error));
      }
    }
    throw new Error(errors.join(" | ") || "All YouTube providers failed");
  }

  if (source === "soundcloud") {
    return fetchSoundCloudDetails(request, config, videoId, options?.urlHint);
  }

  if (source === "jiosaavn") {
    const jioSaavnPayload = await fetchJioSaavnFromEndpoints(
      request,
      buildJioSaavnSongEndpoints(
        videoId,
        config.providers.jiosaavn.apiBase,
        options?.urlHint
      )
    );
    if (jioSaavnPayload?.audioUrl) return jioSaavnPayload;
    throw new Error("Failed to fetch JioSaavn audio stream");
  }

  throw new Error(`Unsupported source: ${source || "unknown"}`);
}

export async function handleVideo(
  request: Request,
  config: WorkerConfig
): Promise<Response> {
  const { searchParams } = new URL(request.url);
  const videoId = searchParams.get("id");
  const source = searchParams.get("source") || undefined;
  const urlHint = searchParams.get("url") || undefined;
  const prewarm = searchParams.get("prewarm") === "1";

  if (prewarm) {
    if (source === "soundcloud") {
      await getSoundCloudClientId(config);
      return json({ ok: true, source: "soundcloud" });
    }
    return json({ ok: true, source: source || "youtube" });
  }

  if (!videoId) {
    return json({ error: "Video ID is required" }, { status: 400 });
  }

  const requestKey = [source || "youtube", videoId, urlHint || ""]
    .join("::")
    .toLowerCase();
  const cached = responseCache.get(requestKey);
  if (cached && Date.now() - cached.at < CACHE_TTL_MS) {
    return json(cached.value);
  }

  try {
    const value = await fetchVideoDetails(request, config, videoId, source, {
      urlHint,
    });
    responseCache.set(requestKey, { at: Date.now(), value });
    return json(value);
  } catch (error) {
    return json(
      {
        error: "Failed to fetch video details",
        details: error instanceof Error ? error.message : String(error),
      },
      { status: 500 }
    );
  }
}
