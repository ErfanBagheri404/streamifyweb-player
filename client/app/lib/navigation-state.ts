"use client";

import type { SearchResult } from "../components/search/types";

export type SavedSearchState = {
  query?: string;
  source?: string;
  filter?: string;
  results?: SearchResult[];
  timestamp?: number;
};

export type SavedArtistRouteContext = {
  name: string;
  image: string;
  source: string;
};

export type SavedCollectionRouteContext = {
  source: string;
  title: string;
  author: string;
  image: string;
  href: string;
  count: string;
};

export function readSavedSearchState(): SavedSearchState | null {
  if (typeof window === "undefined") return null;

  try {
    const raw = window.localStorage.getItem("lastSearch");
    if (!raw) return null;

    const parsed = JSON.parse(raw) as SavedSearchState;
    if (!parsed || typeof parsed !== "object") return null;
    return parsed;
  } catch {
    return null;
  }
}

function normalizeArtistRouteId(value?: string): string {
  const rawValue = String(value || "").trim();
  if (!rawValue) return "";

  if (/^https?:\/\//i.test(rawValue)) {
    try {
      const parsed = new URL(rawValue);
      const segments = parsed.pathname.split("/").filter(Boolean);
      if (segments[0] === "channel" && segments[1]) {
        return segments[1];
      }
    } catch {}
  }

  const normalized = rawValue.replace(/^\/+/, "");
  const channelMatch = normalized.match(/^channel\/([^/?#]+)/i);
  if (channelMatch?.[1]) return channelMatch[1];

  return normalized;
}

function extractYouTubePlaylistId(value?: string): string {
  if (!value) return "";

  const listMatch = value.match(/[?&]list=([^&]+)/);
  if (listMatch?.[1]) return listMatch[1];

  if (/^[A-Za-z0-9_-]{10,}$/.test(value) && !value.includes("/")) {
    return value;
  }

  return "";
}

export function findSavedArtistRouteContext(
  artistId: string
): SavedArtistRouteContext | null {
  const state = readSavedSearchState();
  if (!state?.results?.length) return null;

  const match = state.results.find((item) => {
    const candidateId = normalizeArtistRouteId(item.id || item.authorId || item.uploaderUrl);
    return candidateId === artistId;
  });

  if (!match) return null;

  return {
    name: match.title || match.author || match.name || "",
    image:
      match.thumbnailUrl ||
      match.img ||
      match.authorThumbnails?.[0]?.url ||
      match.thumbnail ||
      match.uploaderAvatar ||
      "",
    source: match.source || "",
  };
}

export function findSavedCollectionRouteContext(
  id: string,
  kind: "album" | "playlist"
): SavedCollectionRouteContext | null {
  const state = readSavedSearchState();
  if (!state?.results?.length) return null;

  const match = state.results.find((item) => {
    const candidateKind = item.type === "album" ? "album" : "playlist";
    const candidateId =
      item.playlistId || extractYouTubePlaylistId(item.href || item.url || "") || item.id;

    return candidateKind === kind && String(candidateId || "") === id;
  });

  if (!match) return null;

  return {
    source: match.source || "",
    title: match.title || "",
    author: match.author || "",
    image: match.thumbnailUrl || match.img || match.thumbnail || "",
    href: match.href || match.url || "",
    count:
      match.videoCount != null && Number.isFinite(match.videoCount)
        ? String(match.videoCount)
        : "",
  };
}
