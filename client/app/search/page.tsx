"use client";

import React, {
  useState,
  useCallback,
  useRef,
  useMemo,
  useEffect,
  Suspense,
} from "react";
import { useRouter, useSearchParams } from "next/navigation";
import { useAudio } from "../contexts/AudioContext";
import {
  SearchInput,
  FilterBar,
  SuggestionsDropdown,
  ResultsList,
  SourceType,
  SearchResult,
  sourceFilters as defaultSourceFilters,
  getFilterOptions,
} from "../components/search";

const DEBUG_SERVER_URL = process.env.NEXT_PUBLIC_DEBUG_SERVER_URL || "";
const DEBUG_SESSION_ID = "playback-source-500";

function reportDebugEvent(
  runId: string,
  hypothesisId: string,
  location: string,
  msg: string,
  data: Record<string, unknown>
) {
  if (!DEBUG_SERVER_URL) return;

  fetch(DEBUG_SERVER_URL, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({
      sessionId: DEBUG_SESSION_ID,
      runId,
      hypothesisId,
      location,
      msg,
      data,
      ts: Date.now(),
    }),
  }).catch(() => {});
}

// ─── Raw Piped item shape (partial) ────────────────────────
interface RawPipedItem {
  url?: string;
  type?: string;
  title?: string;
  thumbnail?: string;
  thumbnailUrl?: string;
  uploaderName?: string;
  uploaderUrl?: string;
  uploaderAvatar?: string;
  uploadedDate?: string;
  shortDescription?: string;
  duration?: number;
  views?: number | string;
  uploaded?: number | string;
  uploaderVerified?: boolean;
  isShort?: boolean;
  // For backwards compatibility with other sources
  videoId?: string;
  playlistId?: string;
  authorId?: string;
  id?: string;
  author?: string;
  artist?: string;
  artwork_url?: string;
  artwork?: string;
  image?: { quality?: string; url?: string }[];
  user?: { username?: string; avatar_url?: string };
  videoThumbnails?: { url: string; width?: number; height?: number }[];
  img?: string;
  authorThumbnails?: { url: string; width?: number; height?: number }[];
  lengthSeconds?: number;
  videoCount?: number;
  channelDescription?: string;
  description?: string;
  verified?: boolean;
  subCount?: number;
  source?: string;
  name?: string;
  tracks?: SearchResult["tracks"];
  videos?: SearchResult["videos"];
}

interface SavedSearchState {
  query: string;
  source: SourceType;
  filter: string;
  results?: SearchResult[];
  timestamp?: number;
}

function scoreImageQuality(
  image: { width?: number; height?: number; quality?: string } | undefined
): number {
  if (!image) return 0;
  const width = image.width ?? 0;
  const height = image.height ?? 0;
  if (width > 0 || height > 0) return width * height;

  const quality = image.quality ?? "";
  const match = quality.match(/(\d+)\s*x\s*(\d+)/i);
  if (!match) return 0;
  return Number(match[1]) * Number(match[2]);
}

function upgradeSoundCloudImage(url?: string): string {
  if (!url) return "";

  return url
    .replace("-large.", "-t500x500.")
    .replace("large.jpg", "t500x500.jpg")
    .replace("large.png", "t500x500.png");
}

function formatUploadedLabel(value?: string | number): string | undefined {
  if (value == null) return undefined;

  const raw = String(value).trim();
  if (!raw || raw === "-1") return undefined;

  const cleaned = raw
    .replace(/^[\d.,]+\s*(?:[KMB]|million|billion)?\s+views?\s*[•-]?\s*/i, "")
    .trim();
  if (!cleaned || cleaned === "-1") return undefined;
  const timestampCandidate = cleaned || raw;

  if (/^\d{10,13}$/.test(timestampCandidate)) {
    const numericValue = Number(timestampCandidate);
    const timestamp =
      timestampCandidate.length === 13 ? numericValue : numericValue * 1000;
    const date = new Date(timestamp);

    if (!Number.isNaN(date.getTime())) {
      return new Intl.DateTimeFormat("en", {
        month: "short",
        day: "numeric",
        year: "numeric",
      }).format(date);
    }
  }

  return cleaned || raw;
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

function getBestThumbnail(raw: RawPipedItem, source: string): string {
  if (Array.isArray(raw.authorThumbnails) && raw.authorThumbnails.length > 0) {
    return [...raw.authorThumbnails].sort(
      (a, b) => scoreImageQuality(b) - scoreImageQuality(a)
    )[0]?.url;
  }

  if (Array.isArray(raw.image) && raw.image.length > 0) {
    return (
      [...raw.image].sort(
        (a, b) => scoreImageQuality(b) - scoreImageQuality(a)
      )[0]?.url || ""
    );
  }

  if (Array.isArray(raw.videoThumbnails) && raw.videoThumbnails.length > 0) {
    return [...raw.videoThumbnails].sort(
      (a, b) => scoreImageQuality(b) - scoreImageQuality(a)
    )[0]?.url;
  }

  const fallback =
    raw.thumbnailUrl ||
    raw.thumbnail ||
    raw.img ||
    raw.artwork_url ||
    raw.artwork ||
    raw.user?.avatar_url ||
    "";

  return source === "soundcloud" ? upgradeSoundCloudImage(fallback) : fallback;
}

export default function SearchPage() {
  return (
    <Suspense fallback={null}>
      <SearchPageInner />
    </Suspense>
  );
}

function SearchPageInner() {
  const router = useRouter();
  const searchParams = useSearchParams();
  const { resolveAndPlaySong } = useAudio();

  // State
  const [searchQuery, setSearchQuery] = useState(() => {
    const query = searchParams.get("q");
    return query || "";
  });
  const [suggestions, setSuggestions] = useState<string[]>([]);
  const [isLoadingSuggestions, setIsLoadingSuggestions] = useState(false);
  const [searchResults, setSearchResults] = useState<SearchResult[]>([]);
  const [isLoading, setIsLoading] = useState(false);
  const [loadingSongId, setLoadingSongId] = useState<string | null>(null);
  const [hasSearched, setHasSearched] = useState(() => {
    return searchParams.get("q") ? true : false;
  });
  const [isLoadingMore, setIsLoadingMore] = useState(false);
  const [hasMoreResults, setHasMoreResults] = useState(true);
  const [currentPage, setCurrentPage] = useState(1);

  const [selectedSource, setSelectedSource] = useState<SourceType>(() => {
    const source = searchParams.get("source");
    return (source as SourceType) || "youtube";
  });
  const [selectedFilter, setSelectedFilter] = useState(() => {
    const filter = searchParams.get("filter");
    return filter || "all";
  });
  const [showFilters, setShowFilters] = useState(false);
  const [sourceFilters, setSourceFilters] = useState(defaultSourceFilters);

  // Refs
  const selectedFilterRef = useRef(selectedFilter);
  const selectedSourceRef = useRef(selectedSource);
  const searchQueryRef = useRef(searchQuery);
  const abortControllerRef = useRef<AbortController | null>(null);
  const didRestoreInitialStateRef = useRef(false);

  // Update URL parameters when state changes
  const updateUrlParams = useCallback(
    (query: string, source: SourceType, filter: string) => {
      const params = new URLSearchParams();
      if (query.trim()) params.set("q", query.trim());
      if (source !== "youtube") params.set("source", source);
      if (filter !== "all") params.set("filter", filter);

      const newUrl = `${window.location.pathname}${
        params.toString() ? "?" + params.toString() : ""
      }`;
      window.history.replaceState({}, "", newUrl);
    },
    []
  );

  useEffect(() => {
    selectedFilterRef.current = selectedFilter;
  }, [selectedFilter]);
  useEffect(() => {
    selectedSourceRef.current = selectedSource;
  }, [selectedSource]);
  useEffect(() => {
    searchQueryRef.current = searchQuery;
  }, [searchQuery]);

  // Update URL parameters when search state changes
  useEffect(() => {
    if (hasSearched || searchQuery) {
      updateUrlParams(searchQuery, selectedSource, selectedFilter);
    }
  }, [
    searchQuery,
    selectedSource,
    selectedFilter,
    hasSearched,
    updateUrlParams,
  ]);

  const typingTimeoutRef = useRef<NodeJS.Timeout | null>(null);
  const paginationRef = useRef({
    page: 1,
    hasMore: true,
    isLoadingMore: false,
    nextpage: null as string | null,
  });
  const lastSearchRef = useRef<{
    query: string;
    source: SourceType;
    filter: string;
  } | null>(null);
  const scrollContainerRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    return () => {
      if (typingTimeoutRef.current) clearTimeout(typingTimeoutRef.current);
      if (abortControllerRef.current) abortControllerRef.current.abort();
    };
  }, []);

  // Handle browser back/forward navigation
  useEffect(() => {
    const handlePopState = () => {
      const savedSearch = localStorage.getItem("lastSearch");
      if (savedSearch) {
        try {
          const searchState = JSON.parse(savedSearch) as SavedSearchState;
          const timestamp = searchState.timestamp || 0;
          const maxAgePopstate = 2 * 60 * 60 * 1000; // 2 hours

          if (Date.now() - timestamp < maxAgePopstate && searchState.query) {
            setSearchQuery(searchState.query || "");
            searchQueryRef.current = searchState.query || "";
            setSelectedSource(searchState.source || "youtube");
            selectedSourceRef.current = searchState.source || "youtube";
            setSelectedFilter(searchState.filter || "all");
            selectedFilterRef.current = searchState.filter || "all";
            setHasSearched(Boolean(searchState.query));
            setSearchResults(searchState.results || []);
          }
        } catch (error) {
          console.error("Error restoring search state on popstate:", error);
        }
      }
    };

    window.addEventListener("popstate", handlePopState);
    return () => window.removeEventListener("popstate", handlePopState);
  }, []);

  // ─── Helper: map raw item to SearchResult ────────────────
  const mapToSearchResult = (raw: RawPipedItem): SearchResult => {
    const source = raw.source || selectedSourceRef.current || "youtube";
    const rawUrl = raw.url || "";
    const playlistIdFromUrl = extractYouTubePlaylistId(rawUrl);
    const rawDisplayTitle =
      typeof raw.title === "string" && raw.title.trim()
        ? raw.title
        : typeof raw.name === "string"
          ? raw.name
          : "";
    let id =
      raw.videoId ||
      raw.playlistId ||
      playlistIdFromUrl ||
      raw.authorId ||
      raw.id ||
      rawUrl ||
      "";

    if (!id && rawUrl) {
      const videoMatch = rawUrl.match(/[?&]v=([^&]+)/);
      if (videoMatch) id = videoMatch[1];
    }

    const thumbnailUrl = getBestThumbnail(raw, source);

    const author = raw.uploaderName || raw.author || raw.artist || "";

    const duration = String(raw.duration ?? raw.lengthSeconds ?? "0");

    const views = raw.views != null ? String(raw.views) : undefined;
    const uploaded = formatUploadedLabel(raw.uploadedDate ?? raw.uploaded);

    // Map type – Piped uses "stream" for videos, "channel" for artists
    let mappedType = raw.type ?? "video";
    if (mappedType === "stream") mappedType = "video";
    if (mappedType === "channel") mappedType = "artist";

    // For channels/artists, the "title" from Piped is often empty, use "author" as the name
    const displayTitle =
      mappedType === "artist" && !rawDisplayTitle
        ? raw.author || raw.uploaderName || ""
        : rawDisplayTitle;

    // #region debug-point H5:search-map-item
    reportDebugEvent(
      `pre-search-map-${Date.now()}`,
      "H5",
      "app/search/page.tsx:mapToSearchResult",
      "[DEBUG] search item normalized",
      {
        source,
        rawType: raw.type || null,
        mappedType,
        id,
        rawId: raw.id || null,
        rawUrl: raw.url || null,
        title: displayTitle,
        hasTracks: Array.isArray(raw.tracks),
        videoCount: raw.videoCount ?? null,
      }
    );
    // #endregion

    return {
      // Keep original fields for potential use, but let normalized values win.
      ...raw,
      id,
      source,
      title: displayTitle,
      author,
      duration,
      views,
      thumbnailUrl,
      uploaded,
      type: mappedType,
    } as SearchResult;
  };

  const saveSearchState = useCallback(
    (override?: Partial<SavedSearchState> & { results?: SearchResult[] }) => {
      const query = override?.query ?? searchQuery;
      const source = override?.source ?? selectedSource;
      const filter = override?.filter ?? selectedFilter;
      const results = override?.results ?? searchResults;

      if (query || hasSearched) {
        const searchState = {
          query,
          source,
          filter,
          results,
          timestamp: Date.now(),
        };
        localStorage.setItem("lastSearch", JSON.stringify(searchState));
      }
    },
    [hasSearched, searchQuery, searchResults, selectedFilter, selectedSource]
  );

  // ─── API call ────────────────────────────────────────────
  const handleSearch = useCallback(
    async (manualQuery?: string, loadMore = false, overrideFilter?: string) => {
      const queryToUse = manualQuery || searchQueryRef.current;
      if (!queryToUse.trim()) return;

      const filterToUse =
        overrideFilter !== undefined
          ? overrideFilter
          : selectedFilterRef.current;
      const sourceToUse = selectedSourceRef.current;

      const last = lastSearchRef.current;
      if (
        !loadMore &&
        searchResults.length > 0 &&
        last &&
        last.query === queryToUse &&
        last.source === sourceToUse &&
        last.filter === filterToUse
      )
        return;

      setHasSearched(true);

      if (loadMore) {
        setIsLoadingMore(true);
      } else {
        setIsLoading(true);
        setCurrentPage(1);
        setHasMoreResults(true);
        paginationRef.current = {
          page: 1,
          hasMore: true,
          isLoadingMore: false,
          nextpage: null,
        };
        setSearchResults([]);
      }

      try {
        const page = loadMore ? currentPage + 1 : 1;
        let url = `/api/search?q=${encodeURIComponent(
          queryToUse
        )}&source=${sourceToUse}&filter=${filterToUse}&page=${page}&limit=20`;
        if (loadMore && paginationRef.current.nextpage) {
          url += `&nextpage=${encodeURIComponent(
            paginationRef.current.nextpage
          )}`;
        }

        console.log("🔍 Search URL:", url);
        const response = await fetch(url);
        const data: {
          items: RawPipedItem[];
          nextpage?: string | null;
        } = await response.json();

        const rawResults: RawPipedItem[] = data.items || [];
        paginationRef.current.nextpage = data.nextpage || null;

        const formatted: SearchResult[] = rawResults.map(mapToSearchResult);

        if (loadMore) {
          setSearchResults((prev) => {
            const existingIds = new Set(prev.map((item) => item.id));
            const newItems = formatted.filter(
              (item) => !existingIds.has(item.id)
            );
            return [...prev, ...newItems];
          });
          setCurrentPage(page);
        } else {
          setSearchResults(formatted);
          setCurrentPage(1);
        }

        const hasMore =
          sourceToUse === "youtube" || sourceToUse === "youtubemusic"
            ? !!paginationRef.current.nextpage
            : formatted.length >= 20;
        setHasMoreResults(hasMore);
        paginationRef.current.hasMore = hasMore;

        lastSearchRef.current = {
          query: queryToUse,
          source: sourceToUse,
          filter: filterToUse,
        };

        if (!loadMore) {
          saveSearchState({
            query: queryToUse,
            source: sourceToUse,
            filter: filterToUse,
            results: formatted,
          });
        }
      } catch (error) {
        console.error("Search error:", error);
        if (!loadMore) setSearchResults([]);
        setHasMoreResults(false);
        paginationRef.current.hasMore = false;
      } finally {
        if (loadMore) setIsLoadingMore(false);
        else setIsLoading(false);
      }
    },
    [searchResults.length, currentPage, saveSearchState]
  );

  const loadMoreResults = useCallback(async () => {
    if (isLoadingMore || !hasMoreResults || !searchQueryRef.current.trim())
      return;
    if (paginationRef.current.isLoadingMore || !paginationRef.current.hasMore)
      return;

    paginationRef.current.isLoadingMore = true;
    await handleSearch(undefined, true);
    paginationRef.current.isLoadingMore = false;
  }, [isLoadingMore, hasMoreResults, handleSearch]);

  function restoreSavedSearchState(searchState: SavedSearchState) {
    setSearchQuery(searchState.query || "");
    searchQueryRef.current = searchState.query || "";
    setSelectedSource(searchState.source || "youtube");
    selectedSourceRef.current = searchState.source || "youtube";
    setSelectedFilter(searchState.filter || "all");
    selectedFilterRef.current = searchState.filter || "all";
    setHasSearched(Boolean(searchState.query));
    setSearchResults(searchState.results || []);
  }

  // Restore search state from URL/localStorage on mount
  useEffect(() => {
    if (didRestoreInitialStateRef.current) return;
    didRestoreInitialStateRef.current = true;

    const queryFromUrl = searchParams.get("q") || "";
    const sourceFromUrl =
      (searchParams.get("source") as SourceType) || "youtube";
    const filterFromUrl = searchParams.get("filter") || "all";
    const savedSearch = localStorage.getItem("lastSearch");
    let parsedSavedSearch: SavedSearchState | null = null;

    if (savedSearch) {
      try {
        parsedSavedSearch = JSON.parse(savedSearch) as SavedSearchState;
        const timestamp = parsedSavedSearch.timestamp || 0;
        const maxAge = 2 * 60 * 60 * 1000;

        if (Date.now() - timestamp >= maxAge) {
          parsedSavedSearch = null;
          localStorage.removeItem("lastSearch");
        }
      } catch (error) {
        console.error("Error restoring search state:", error);
        localStorage.removeItem("lastSearch");
      }
    }

    if (queryFromUrl) {
      const hasMatchingSavedResults =
        parsedSavedSearch?.query === queryFromUrl &&
        (parsedSavedSearch?.source || "youtube") === sourceFromUrl &&
        (parsedSavedSearch?.filter || "all") === filterFromUrl &&
        Array.isArray(parsedSavedSearch?.results) &&
        parsedSavedSearch.results.length > 0;

      if (hasMatchingSavedResults && parsedSavedSearch) {
        setTimeout(() => {
          restoreSavedSearchState(parsedSavedSearch!);
        }, 0);
      } else {
        setTimeout(() => {
          setSearchQuery(queryFromUrl);
          searchQueryRef.current = queryFromUrl;
          setSelectedSource(sourceFromUrl);
          selectedSourceRef.current = sourceFromUrl;
          setSelectedFilter(filterFromUrl);
          selectedFilterRef.current = filterFromUrl;
          setHasSearched(true);
          handleSearch(queryFromUrl, false, filterFromUrl);
        }, 0);
      }
      return;
    }

    if (parsedSavedSearch?.query) {
      setTimeout(() => {
        restoreSavedSearchState(parsedSavedSearch!);
      }, 0);
    }
  }, [handleSearch, searchParams]);

  // ─── Input change with debounce & suggestions ────────────
  const handleTextChange = useCallback((text: string) => {
    setSearchQuery(text);
    searchQueryRef.current = text;

    // Cancel any pending requests
    if (abortControllerRef.current) {
      abortControllerRef.current.abort();
    }

    if (typingTimeoutRef.current) clearTimeout(typingTimeoutRef.current);

    if (text.trim().length < 2) {
      setSuggestions([]);
      if (text.length === 0) setHasSearched(false);
      return;
    }

    // Fetch suggestions with debounce
    typingTimeoutRef.current = setTimeout(async () => {
      const source = selectedSourceRef.current;

      // For YouTube sources, fetch from Piped API
      if (source === "youtube" || source === "youtubemusic") {
        try {
          setIsLoadingSuggestions(true);
          abortControllerRef.current = new AbortController();

          const response = await fetch(
            `https://api.piped.private.coffee/opensearch/suggestions?query=${encodeURIComponent(
              text
            )}`,
            { signal: abortControllerRef.current.signal }
          );

          if (!response.ok) {
            throw new Error(`HTTP error! status: ${response.status}`);
          }

          const data = await response.json();
          const suggestionCandidates = Array.isArray(data)
            ? Array.isArray(data[1])
              ? data[1]
              : data.slice(1)
            : [];

          const normalizedSuggestions = suggestionCandidates
            .flatMap((value) => (Array.isArray(value) ? value : [value]))
            .filter((value): value is string => typeof value === "string")
            .map((value) => value.trim())
            .filter(Boolean);

          setSuggestions([...new Set(normalizedSuggestions)].slice(0, 8));
        } catch (error) {
          if ((error as Error).name !== "AbortError") {
            console.error("Error fetching suggestions:", error);
          }
          setSuggestions([]);
        } finally {
          setIsLoadingSuggestions(false);
        }
      } else if (source === "soundcloud") {
        // SoundCloud fallback suggestions
        const fallbackTerms = ["mix", "remix", "live"];
        const newSuggestions = [
          text,
          ...fallbackTerms.map((term) => `${text} ${term}`),
        ];
        setSuggestions(newSuggestions.slice(0, 5));
      } else {
        setSuggestions([]);
      }
    }, 200);
  }, []);

  const handleCategorySelect = useCallback(
    (category: string) => {
      setSearchQuery(category);
      searchQueryRef.current = category;
      setSuggestions([]);
      handleSearch(category);
    },
    [handleSearch]
  );

  // ─── Source selection ────────────────────────────────────
  const handleSourceSelect = useCallback(
    (sourceId: SourceType) => {
      setSourceFilters((prev) => {
        const selected = prev.find((f) => f.id === sourceId);
        if (!selected) return prev;
        const others = prev.filter((f) => f.id !== sourceId);
        return [selected, ...others];
      });
      setSelectedSource(sourceId);
      selectedSourceRef.current = sourceId;

      let newFilter = "";
      switch (sourceId) {
        case "soundcloud":
          newFilter = "tracks";
          break;
        case "youtubemusic":
          newFilter = "songs";
          break;
        default:
          newFilter = "all";
          break;
      }
      setSelectedFilter(newFilter);
      selectedFilterRef.current = newFilter;
      if (searchQueryRef.current.trim()) {
        handleSearch(undefined, false, newFilter);
      }
    },
    [handleSearch]
  );

  // ─── Filter selection ────────────────────────────────────
  const handleFilterSelect = useCallback(
    (filterValue: string) => {
      console.log("Filter selected:", filterValue);
      setSelectedFilter(filterValue);
      selectedFilterRef.current = filterValue;
      if (searchQueryRef.current.trim()) {
        handleSearch(undefined, false, filterValue);
      }
    },
    [handleSearch]
  );

  const clearSearch = () => {
    setSearchQuery("");
    searchQueryRef.current = "";
    setSuggestions([]);
    setSearchResults([]);
    setHasSearched(false);
    // Clear URL parameters
    router.push("/search");
    // Clear saved search state
    localStorage.removeItem("lastSearch");
  };

  // ─── Navigation handlers ─────────────────────────────────
  const buildArtistUrl = (item: SearchResult) => {
    const name = item.title || item.author || item.name || "";
    const image =
      item.thumbnailUrl ||
      item.img ||
      item.authorThumbnails?.[0]?.url ||
      item.thumbnail ||
      "";
    const artistId = normalizeArtistRouteId(item.id);

    const params = new URLSearchParams();
    if (name) params.set("name", name);
    if (image) params.set("image", image);
    if (item.source) params.set("source", item.source);

    // Preserve search state
    if (searchQuery) params.set("search_query", searchQuery);
    if (selectedSource !== "youtube")
      params.set("search_source", selectedSource);
    if (selectedFilter !== "all") params.set("search_filter", selectedFilter);

    const qs = params.toString();
    return `/artist/${encodeURIComponent(artistId || item.id)}${
      qs ? `?${qs}` : ""
    }`;
  };

  const handleTopResultPress = (item: SearchResult) => {
    // Save search state before navigation
    saveSearchState();
    if (item.source === "youtube_channel" || item.type === "artist") {
      router.push(buildArtistUrl(item));
    } else {
      console.log("Play:", item.title);
    }
  };
  const handleArtistPress = (item: SearchResult) => {
    // Save search state before navigation
    saveSearchState();
    router.push(buildArtistUrl(item));
  };
  const handleAlbumPress = (item: SearchResult) => {
    // Save search state before navigation
    saveSearchState();
    const kind = item.type === "album" ? "album" : "playlist";
    const collectionId =
      item.playlistId ||
      extractYouTubePlaylistId(item.href || item.url || "") ||
      item.id;
    const params = new URLSearchParams();
    params.set("title", item.title || "");
    if (item.author) params.set("author", item.author);
    if (item.source) params.set("source", item.source);
    if (item.thumbnailUrl || item.img || item.thumbnail) {
      params.set(
        "image",
        item.thumbnailUrl || item.img || item.thumbnail || ""
      );
    }
    if (item.href || item.url) params.set("href", item.href || item.url || "");
    if (item.videoCount != null) params.set("count", String(item.videoCount));
    if (searchQuery) params.set("search_query", searchQuery);
    if (selectedSource !== "youtube")
      params.set("search_source", selectedSource);
    if (selectedFilter !== "all") params.set("search_filter", selectedFilter);
    // #region debug-point H5:collection-nav
    reportDebugEvent(
      `pre-collection-nav-${Date.now()}`,
      "H5",
      "app/search/page.tsx:handleAlbumPress",
      "[DEBUG] collection navigation requested",
      {
        id: item.id,
        source: item.source || null,
        type: item.type || null,
        title: item.title,
        href: item.href || item.url || null,
        collectionId,
        count: item.videoCount ?? null,
        hasTracks: Array.isArray(item.tracks),
        hasVideos: Array.isArray(item.videos),
      }
    );
    // #endregion
    router.push(
      `/collection/${kind}/${encodeURIComponent(collectionId)}?${params.toString()}`
    );
  };
  const handleSongPress = async (item: SearchResult) => {
    if (loadingSongId === item.id) return;

    // Save search state before navigation
    saveSearchState();
    setLoadingSongId(item.id);

    try {
      const artistId = normalizeArtistRouteId(item.authorId || item.uploaderUrl);
      const artistImage = item.uploaderAvatar || item.authorThumbnails?.[0]?.url;
      const songResults = searchResults.filter(
        (result) =>
          result.type === "song" ||
          result.type === "video" ||
          result.type === "stream" ||
          (!result.type && result.duration)
      );

      const queue = songResults.map((result) => ({
        id: result.id,
        title: result.title,
        artist: result.author || "Unknown Artist",
        artistId: normalizeArtistRouteId(result.authorId || result.uploaderUrl),
        artistImage:
          result.uploaderAvatar || result.authorThumbnails?.[0]?.url,
        artistSource: result.source,
        coverUrl: result.thumbnailUrl || result.img || result.thumbnail,
        uploaded: result.uploaded,
        duration: result.duration ? parseInt(result.duration, 10) : undefined,
        source: result.source,
        url: result.href || result.url || result.permalink_url,
      }));

      const currentIndex = queue.findIndex((song) => song.id === item.id);

      await resolveAndPlaySong(
        {
          id: item.id,
          title: item.title,
          artist: item.author || "Unknown Artist",
          artistId: artistId || undefined,
          artistImage,
          artistSource: item.source,
          coverUrl: item.thumbnailUrl || item.img || item.thumbnail,
          uploaded: item.uploaded,
          duration: item.duration ? parseInt(item.duration, 10) : undefined,
          source: item.source,
          url: item.href || item.url || item.permalink_url,
        },
        {
          queue,
          currentIndex: currentIndex >= 0 ? currentIndex : 0,
        }
      );
    } catch (error) {
      console.error("Failed to play search result:", error);
    } finally {
      setLoadingSongId((current) => (current === item.id ? null : current));
    }
  };

  // ─── Filter results into sections ────────────────────────
  const filteredResults = useMemo(() => {
    if (!searchResults.length)
      return {
        topResults: [],
        artists: [],
        albums: [],
        playlists: [],
        songs: [],
      };

    const topResults = searchResults.filter(
      (item) => item.type === "unknown" || item.type === "hashtag"
    );
    const artists = searchResults.filter(
      (item) => item.type === "artist" || item.type === "channel"
    );
    const albums = searchResults.filter((item) => item.type === "album");
    const playlists = searchResults.filter((item) => item.type === "playlist");
    const songs = searchResults.filter(
      (item) =>
        item.type === "song" ||
        item.type === "video" ||
        item.type === "stream" ||
        (!item.type && item.duration)
    );

    return { topResults, artists, albums, playlists, songs };
  }, [searchResults]);

  const currentFilterOptions = getFilterOptions(selectedSource);

  return (
    <div className="h-full text-white flex flex-col overflow-hidden">
      <SearchInput
        value={searchQuery}
        onChange={handleTextChange}
        onSearch={() => handleSearch()}
        onClear={clearSearch}
        onFocus={() => {}}
        onFilterToggle={() => setShowFilters((prev) => !prev)}
        placeholder={`Search ${
          sourceFilters.find((s) => s.id === selectedSource)?.label
        }...`}
      >
        <SuggestionsDropdown
          suggestions={suggestions}
          onSelect={(item) => {
            setSearchQuery(item);
            searchQueryRef.current = item;
            handleSearch(item);
          }}
          onClose={() => setSuggestions([])}
          isLoading={isLoadingSuggestions}
        />
      </SearchInput>

      <FilterBar
        showFilters={showFilters}
        sourceFilters={sourceFilters}
        selectedSource={selectedSource}
        onSourceSelect={handleSourceSelect}
        filterOptions={currentFilterOptions}
        selectedFilter={selectedFilter}
        onFilterSelect={handleFilterSelect}
      />

      <div
        ref={scrollContainerRef}
        className="flex-1 overflow-y-auto hide-scrollbar"
      >
        <ResultsList
          isLoading={isLoading}
          hasSearched={hasSearched}
          searchResults={searchResults}
          selectedSource={selectedSource}
          searchQuery={searchQuery}
          isLoadingMore={isLoadingMore}
          hasMoreResults={hasMoreResults}
          onLoadMore={loadMoreResults}
          filteredResults={filteredResults}
          onTopResultPress={handleTopResultPress}
          onArtistPress={handleArtistPress}
          onAlbumPress={handleAlbumPress}
          onSongPress={handleSongPress}
          onCategorySelect={handleCategorySelect}
        />
      </div>
    </div>
  );
}
