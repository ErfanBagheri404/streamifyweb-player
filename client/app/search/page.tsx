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
import { useSettings } from "../contexts/SettingsContext";
import { useAppLanguage } from "../hooks/useAppLanguage";
import type { PreferredSearchSource } from "../lib/app-settings";
import {
  getSearchCategoryPlaylistHref,
  type SearchCategoryPlaylist,
} from "../lib/search-category-playlists";
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

const SEARCH_STATE_UPDATED_EVENT = "streamify-search-state-updated";
const SEARCH_HISTORY_STORAGE_KEY = "searchHistory";
const SEARCH_PAGE_SESSION_STATE_KEY = "streamify-search-page-session-state";

function readStoredSearchHistory(): string[] {
  if (typeof window === "undefined") return [];
  try {
    const raw = window.localStorage.getItem(SEARCH_HISTORY_STORAGE_KEY);
    if (!raw) return [];
    const parsed = JSON.parse(raw) as unknown;
    if (!Array.isArray(parsed)) return [];
    return parsed
      .filter((value): value is string => typeof value === "string")
      .map((value) => value.trim())
      .filter(Boolean)
      .slice(0, 12);
  } catch {
    return [];
  }
}

function writeStoredSearchHistory(nextHistory: string[]) {
  if (typeof window === "undefined") return;
  try {
    window.localStorage.setItem(
      SEARCH_HISTORY_STORAGE_KEY,
      JSON.stringify(nextHistory)
    );
  } catch {}
}

function mergeSearchHistory(history: string[], value: string): string[] {
  const cleaned = value.trim();
  if (!cleaned) return history;
  const lowered = cleaned.toLowerCase();
  const deduped = [
    cleaned,
    ...history.filter((term) => term.toLowerCase() !== lowered),
  ];
  return deduped.slice(0, 12);
}

function filterSearchHistory(history: string[], query: string): string[] {
  const cleaned = query.trim().toLowerCase();
  if (!cleaned) return history.slice(0, 8);
  return history
    .filter((term) => term.toLowerCase().includes(cleaned))
    .slice(0, 8);
}

function reportDebugEvent(
  _runId: string,
  _hypothesisId: string,
  _location: string,
  _msg: string,
  _data: Record<string, unknown>
) {}

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

interface SearchPageSessionState extends SavedSearchState {
  hasSearched?: boolean;
  currentPage?: number;
  hasMoreResults?: boolean;
  nextpage?: string | null;
  scrollTop?: number;
}

function readStoredSearchPageSessionState(): SearchPageSessionState | null {
  if (typeof window === "undefined") return null;

  try {
    const raw = window.sessionStorage.getItem(SEARCH_PAGE_SESSION_STATE_KEY);
    if (!raw) return null;

    const parsed = JSON.parse(raw) as SearchPageSessionState;
    if (!parsed || typeof parsed !== "object") return null;

    return parsed;
  } catch {
    return null;
  }
}

function writeStoredSearchPageSessionState(state: SearchPageSessionState) {
  if (typeof window === "undefined") return;

  try {
    window.sessionStorage.setItem(
      SEARCH_PAGE_SESSION_STATE_KEY,
      JSON.stringify(state)
    );
  } catch {}
}

function clearStoredSearchPageSessionState() {
  if (typeof window === "undefined") return;

  try {
    window.sessionStorage.removeItem(SEARCH_PAGE_SESSION_STATE_KEY);
  } catch {}
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

  const parsedDate = new Date(timestampCandidate);
  if (!Number.isNaN(parsedDate.getTime())) {
    return new Intl.DateTimeFormat("en", {
      month: "short",
      day: "numeric",
      year: "numeric",
    }).format(parsedDate);
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
  const { hasHydratedSettings, settings } = useSettings();
  const { t, getSourceLabel } = useAppLanguage();
  const { resolveAndPlaySong } = useAudio();

  // State
  const [searchQuery, setSearchQuery] = useState(() => {
    const query = searchParams.get("q");
    return query || "";
  });
  const [searchHistory, setSearchHistory] = useState<string[]>(() =>
    readStoredSearchHistory()
  );
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
    return (source as SourceType) || "mixed";
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
  const searchResultsRef = useRef<SearchResult[]>([]);
  const hasSearchedRef = useRef(hasSearched);
  const currentPageRef = useRef(currentPage);
  const hasMoreResultsRef = useRef(hasMoreResults);
  const sessionPersistenceReadyRef = useRef(false);
  const pendingScrollRestoreRef = useRef<number | null>(null);
  const scrollPersistTimerRef = useRef<number | null>(null);
  const handleSearchRef = useRef<
    (
      manualQuery?: string,
      loadMore?: boolean,
      overrideFilter?: string
    ) => Promise<void>
  >(async () => {});

  // Update URL parameters when state changes
  const updateUrlParams = useCallback(
    (query: string, source: SourceType, filter: string) => {
      const params = new URLSearchParams();
      if (query.trim()) params.set("q", query.trim());
      if (source !== "mixed") params.set("source", source);
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
  useEffect(() => {
    searchResultsRef.current = searchResults;
  }, [searchResults]);
  useEffect(() => {
    hasSearchedRef.current = hasSearched;
  }, [hasSearched]);
  useEffect(() => {
    currentPageRef.current = currentPage;
  }, [currentPage]);
  useEffect(() => {
    hasMoreResultsRef.current = hasMoreResults;
  }, [hasMoreResults]);

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

  useEffect(() => {
    const sync = () => {
      setSearchHistory(readStoredSearchHistory());
    };
    sync();
    window.addEventListener("storage", sync);
    return () => window.removeEventListener("storage", sync);
  }, []);

  // Handle browser back/forward navigation
  useEffect(() => {
    const handlePopState = () => {
      const urlQuery = new URLSearchParams(window.location.search).get("q");
      const urlSource =
        (new URLSearchParams(window.location.search).get(
          "source"
        ) as SourceType) || "mixed";
      const urlFilter =
        new URLSearchParams(window.location.search).get("filter") || "all";

      if (urlQuery) {
        setSearchQuery(urlQuery);
        searchQueryRef.current = urlQuery;
        setSelectedSource(urlSource);
        selectedSourceRef.current = urlSource;
        setSelectedFilter(urlFilter);
        selectedFilterRef.current = urlFilter;
        setHasSearched(true);
        // Always re-run the search on back/forward to avoid stale state.
        void handleSearchRef.current(urlQuery, false, urlFilter);
      } else {
        setSearchResults([]);
        setHasSearched(false);
      }
    };

    window.addEventListener("popstate", handlePopState);
    return () => window.removeEventListener("popstate", handlePopState);
  }, []);

  // ─── Helper: map raw item to SearchResult ────────────────
  const mapToSearchResult = (raw: RawPipedItem): SearchResult => {
    const source = raw.source || selectedSourceRef.current || "mixed";
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
      if (!settings.rememberLastSearch) return;

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
        window.dispatchEvent(new CustomEvent(SEARCH_STATE_UPDATED_EVENT));
      }
    },
    [
      hasSearched,
      searchQuery,
      searchResults,
      selectedFilter,
      selectedSource,
      settings.rememberLastSearch,
    ]
  );

  const persistSearchPageSessionState = useCallback(
    (override?: Partial<SearchPageSessionState>) => {
      const query = override?.query ?? searchQueryRef.current;
      const source = override?.source ?? selectedSourceRef.current;
      const filter = override?.filter ?? selectedFilterRef.current;
      const results = override?.results ?? searchResultsRef.current;
      const hasSearchedValue = override?.hasSearched ?? hasSearchedRef.current;

      if (!query.trim() && !hasSearchedValue && results.length === 0) {
        clearStoredSearchPageSessionState();
        return;
      }

      writeStoredSearchPageSessionState({
        query,
        source,
        filter,
        results,
        hasSearched: hasSearchedValue,
        currentPage: override?.currentPage ?? currentPageRef.current,
        hasMoreResults: override?.hasMoreResults ?? hasMoreResultsRef.current,
        nextpage:
          override?.nextpage !== undefined
            ? override.nextpage
            : paginationRef.current.nextpage,
        scrollTop:
          override?.scrollTop ?? scrollContainerRef.current?.scrollTop ?? 0,
        timestamp: Date.now(),
      });
    },
    []
  );

  const persistCurrentSearchContext = useCallback(() => {
    persistSearchPageSessionState();
    saveSearchState();
  }, [persistSearchPageSessionState, saveSearchState]);

  const addToSearchHistory = useCallback(
    (term: string) => {
      if (!settings.rememberLastSearch) return;
      setSearchHistory((prev) => {
        const next = mergeSearchHistory(prev, term);
        writeStoredSearchHistory(next);
        return next;
      });
    },
    [settings.rememberLastSearch]
  );

  const showHistorySuggestions = useCallback(
    (query: string) => {
      setSuggestions(filterSearchHistory(searchHistory, query));
    },
    [searchHistory]
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

      setHasSearched(true);
      hasSearchedRef.current = true;
      if (!loadMore) {
        addToSearchHistory(queryToUse);
      }

      if (loadMore) {
        setIsLoadingMore(true);
      } else {
        setIsLoading(true);
        setCurrentPage(1);
        currentPageRef.current = 1;
        setHasMoreResults(true);
        hasMoreResultsRef.current = true;
        paginationRef.current = {
          page: 1,
          hasMore: true,
          isLoadingMore: false,
          nextpage: null,
        };
        setSearchResults([]);
        searchResultsRef.current = [];
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
        const hasMore =
          sourceToUse === "mixed"
            ? false
            : sourceToUse === "youtube" || sourceToUse === "youtubemusic"
            ? !!paginationRef.current.nextpage
            : formatted.length >= 20;

        if (loadMore) {
          setSearchResults((prev) => {
            const existingIds = new Set(prev.map((item) => item.id));
            const newItems = formatted.filter(
              (item) => !existingIds.has(item.id)
            );
            const mergedResults = [...prev, ...newItems];
            saveSearchState({
              query: queryToUse,
              source: sourceToUse,
              filter: filterToUse,
              results: mergedResults,
            });
            persistSearchPageSessionState({
              query: queryToUse,
              source: sourceToUse,
              filter: filterToUse,
              results: mergedResults,
              hasSearched: true,
              currentPage: page,
              hasMoreResults: hasMore,
              nextpage: paginationRef.current.nextpage,
            });
            return mergedResults;
          });
          setCurrentPage(page);
          currentPageRef.current = page;
        } else {
          setSearchResults(formatted);
          searchResultsRef.current = formatted;
          setCurrentPage(1);
          currentPageRef.current = 1;
          saveSearchState({
            query: queryToUse,
            source: sourceToUse,
            filter: filterToUse,
            results: formatted,
          });
          persistSearchPageSessionState({
            query: queryToUse,
            source: sourceToUse,
            filter: filterToUse,
            results: formatted,
            hasSearched: true,
            currentPage: 1,
            hasMoreResults: hasMore,
            nextpage: paginationRef.current.nextpage,
          });
        }

        setHasMoreResults(hasMore);
        hasMoreResultsRef.current = hasMore;
        paginationRef.current.page = page;
        paginationRef.current.hasMore = hasMore;

        lastSearchRef.current = {
          query: queryToUse,
          source: sourceToUse,
          filter: filterToUse,
        };
      } catch (error) {
        console.error("Search error:", error);
        if (!loadMore) {
          setSearchResults([]);
          searchResultsRef.current = [];
        }
        setHasMoreResults(false);
        hasMoreResultsRef.current = false;
        paginationRef.current.hasMore = false;
      } finally {
        if (loadMore) setIsLoadingMore(false);
        else setIsLoading(false);
      }
    },
    [addToSearchHistory, currentPage, saveSearchState, searchResults.length]
  );

  // Keep the ref pointed at the latest handleSearch so popstate/mount can call it.
  useEffect(() => {
    handleSearchRef.current = handleSearch;
  }, [handleSearch]);

  const loadMoreResults = useCallback(async () => {
    if (isLoadingMore || !hasMoreResults || !searchQueryRef.current.trim())
      return;
    if (paginationRef.current.isLoadingMore || !paginationRef.current.hasMore)
      return;

    paginationRef.current.isLoadingMore = true;
    await handleSearch(undefined, true);
    paginationRef.current.isLoadingMore = false;
  }, [isLoadingMore, hasMoreResults, handleSearch]);

  // Restore search state from URL on mount
  useEffect(() => {
    if (!hasHydratedSettings) return;
    if (searchParams.get("q")) return;
    if (searchParams.get("source")) return;
    if (hasSearched || searchQueryRef.current.trim()) return;

    const preferredSource = settings.preferredSearchSource;
    let nextFilter = "all";
    if (preferredSource === "soundcloud") nextFilter = "tracks";
    if (preferredSource === "youtubemusic") nextFilter = "songs";
    if (preferredSource === "jiosaavn") nextFilter = "all";

    setSelectedSource(preferredSource);
    selectedSourceRef.current = preferredSource;
    setSelectedFilter(nextFilter);
    selectedFilterRef.current = nextFilter;
    setSourceFilters((prev) => {
      const selected = prev.find((entry) => entry.id === preferredSource);
      if (!selected) return prev;
      return [
        selected,
        ...prev.filter((entry) => entry.id !== preferredSource),
      ];
    });
  }, [
    hasHydratedSettings,
    hasSearched,
    searchParams,
    settings.preferredSearchSource,
  ]);

  useEffect(() => {
    if (settings.rememberLastSearch) return;

    localStorage.removeItem("lastSearch");
    localStorage.removeItem(SEARCH_HISTORY_STORAGE_KEY);
    setSearchHistory([]);
    window.dispatchEvent(new CustomEvent(SEARCH_STATE_UPDATED_EVENT));
  }, [settings.rememberLastSearch]);

  useEffect(() => {
    if (!sessionPersistenceReadyRef.current) return;

    persistSearchPageSessionState();
  }, [
    currentPage,
    hasMoreResults,
    hasSearched,
    persistSearchPageSessionState,
    searchResults,
  ]);

  useEffect(() => {
    const container = scrollContainerRef.current;
    if (!container || !sessionPersistenceReadyRef.current) return;

    const handleScroll = () => {
      if (scrollPersistTimerRef.current !== null) {
        window.clearTimeout(scrollPersistTimerRef.current);
      }

      scrollPersistTimerRef.current = window.setTimeout(() => {
        persistSearchPageSessionState({
          scrollTop: container.scrollTop,
        });
      }, 120);
    };

    container.addEventListener("scroll", handleScroll, { passive: true });

    return () => {
      container.removeEventListener("scroll", handleScroll);
      if (scrollPersistTimerRef.current !== null) {
        window.clearTimeout(scrollPersistTimerRef.current);
        scrollPersistTimerRef.current = null;
      }
    };
  }, [persistSearchPageSessionState, searchResults.length]);

  useEffect(() => {
    if (didRestoreInitialStateRef.current) return;
    didRestoreInitialStateRef.current = true;

    const queryFromUrl = searchParams.get("q") || "";
    const sourceFromUrl =
      (searchParams.get("source") as SourceType) || "mixed";
    const filterFromUrl = searchParams.get("filter") || "all";
    const savedSessionState = readStoredSearchPageSessionState();
    const savedSessionSource =
      (savedSessionState?.source as SourceType | undefined) || "mixed";
    const savedSessionFilter = savedSessionState?.filter || "all";
    const hasSavedSessionQuery = Boolean(savedSessionState?.query?.trim());
    const matchesSavedSession =
      Boolean(savedSessionState) &&
      savedSessionState?.query === queryFromUrl &&
      savedSessionSource === sourceFromUrl &&
      savedSessionFilter === filterFromUrl;
    const shouldRestoreSavedSession =
      Boolean(savedSessionState) &&
      (matchesSavedSession || (!queryFromUrl && hasSavedSessionQuery));
    const initialQuery = queryFromUrl || savedSessionState?.query?.trim() || "";
    const initialSource = queryFromUrl ? sourceFromUrl : savedSessionSource;
    const initialFilter = queryFromUrl ? filterFromUrl : savedSessionFilter;

    if (initialQuery) {
      setTimeout(() => {
        setSearchQuery(initialQuery);
        searchQueryRef.current = initialQuery;
        setSelectedSource(initialSource);
        selectedSourceRef.current = initialSource;
        setSelectedFilter(initialFilter);
        selectedFilterRef.current = initialFilter;
        if (shouldRestoreSavedSession && savedSessionState?.results) {
          setHasSearched(savedSessionState.hasSearched ?? true);
          hasSearchedRef.current = savedSessionState.hasSearched ?? true;
          setSearchResults(savedSessionState.results);
          searchResultsRef.current = savedSessionState.results;
          setCurrentPage(savedSessionState.currentPage || 1);
          currentPageRef.current = savedSessionState.currentPage || 1;
          setHasMoreResults(Boolean(savedSessionState.hasMoreResults));
          hasMoreResultsRef.current = Boolean(savedSessionState.hasMoreResults);
          paginationRef.current = {
            page: savedSessionState.currentPage || 1,
            hasMore: Boolean(savedSessionState.hasMoreResults),
            isLoadingMore: false,
            nextpage: savedSessionState.nextpage || null,
          };
          pendingScrollRestoreRef.current = savedSessionState.scrollTop ?? 0;
        } else {
          setHasSearched(true);
          hasSearchedRef.current = true;
          void handleSearchRef.current(initialQuery, false, initialFilter);
        }

        sessionPersistenceReadyRef.current = true;
      }, 0);
    } else {
      sessionPersistenceReadyRef.current = true;
    }
  }, [searchParams]);

  useEffect(() => {
    if (pendingScrollRestoreRef.current == null) return;
    if (searchResults.length === 0) return;

    const scrollTop = pendingScrollRestoreRef.current;
    const container = scrollContainerRef.current;
    if (!container) return;

    const frameId = window.requestAnimationFrame(() => {
      container.scrollTop = scrollTop;
      pendingScrollRestoreRef.current = null;
    });

    return () => {
      window.cancelAnimationFrame(frameId);
    };
  }, [searchResults.length]);

  useEffect(
    () => () => {
      if (scrollPersistTimerRef.current !== null) {
        window.clearTimeout(scrollPersistTimerRef.current);
      }

      if (sessionPersistenceReadyRef.current) {
        persistSearchPageSessionState();
      }
    },
    [persistSearchPageSessionState]
  );

  // ─── Input change with debounce & suggestions ────────────
  const handleTextChange = useCallback(
    (text: string) => {
      setSearchQuery(text);
      searchQueryRef.current = text;

      // Cancel any pending requests
      if (abortControllerRef.current) {
        abortControllerRef.current.abort();
      }

      if (typingTimeoutRef.current) clearTimeout(typingTimeoutRef.current);

      if (text.trim().length < 2) {
        showHistorySuggestions(text);
        if (text.length === 0) setHasSearched(false);
        return;
      }

      // Fetch suggestions with debounce
      typingTimeoutRef.current = setTimeout(async () => {
        const source = selectedSourceRef.current;

        // For YouTube sources, fetch from Piped API
        if (
          source === "mixed" ||
          source === "youtube" ||
          source === "youtubemusic"
        ) {
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
    },
    [showHistorySuggestions]
  );

  const handleCategorySelect = useCallback(
    (category: SearchCategoryPlaylist) => {
      const href = getSearchCategoryPlaylistHref(category);
      if (!href) return;

      setSuggestions([]);
      persistCurrentSearchContext();
      router.push(href);
    },
    [persistCurrentSearchContext, router]
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
        case "mixed":
        case "jiosaavn":
          newFilter = "all";
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
    searchResultsRef.current = [];
    setHasSearched(false);
    hasSearchedRef.current = false;
    setCurrentPage(1);
    currentPageRef.current = 1;
    setHasMoreResults(true);
    hasMoreResultsRef.current = true;
    // Clear URL parameters
    router.push("/search");
    // Clear saved search state
    localStorage.removeItem("lastSearch");
    clearStoredSearchPageSessionState();
    window.dispatchEvent(new CustomEvent(SEARCH_STATE_UPDATED_EVENT));
  };

  // ─── Navigation handlers ─────────────────────────────────
  const buildArtistUrl = (item: SearchResult) => {
    const artistId = normalizeArtistRouteId(item.id);

    const params = new URLSearchParams();
    if (item.source && item.source !== "youtube") {
      params.set("source", item.source);
    }
    if (searchQuery) params.set("search_query", searchQuery);
    if (selectedSource !== "mixed")
      params.set("search_source", selectedSource);
    if (selectedFilter !== "all") params.set("search_filter", selectedFilter);

    const qs = params.toString();
    return `/artist/${encodeURIComponent(artistId || item.id)}${
      qs ? `?${qs}` : ""
    }`;
  };

  const handleTopResultPress = (item: SearchResult) => {
    if (item.source === "youtube_channel" || item.type === "artist") {
      persistCurrentSearchContext();
      router.push(buildArtistUrl(item));
    } else {
      console.log("Play:", item.title);
    }
  };
  const handleArtistPress = (item: SearchResult) => {
    persistCurrentSearchContext();
    router.push(buildArtistUrl(item));
  };
  const handleAlbumPress = (item: SearchResult) => {
    const kind = item.type === "album" ? "album" : "playlist";
    const collectionId =
      item.playlistId ||
      extractYouTubePlaylistId(item.href || item.url || "") ||
      item.id;
    const params = new URLSearchParams();
    if (item.source) params.set("source", item.source);
    if (searchQuery) params.set("search_query", searchQuery);
    if (selectedSource !== "mixed")
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
    persistCurrentSearchContext();
    router.push(
      `/collection/${kind}/${encodeURIComponent(
        collectionId
      )}?${params.toString()}`
    );
  };
  const handleSongPress = async (item: SearchResult) => {
    if (loadingSongId === item.id) return;

    // Save search state before navigation
    persistSearchPageSessionState();
    saveSearchState();
    setLoadingSongId(item.id);

    try {
      const artistId = normalizeArtistRouteId(
        item.authorId || item.uploaderUrl
      );
      const artistImage =
        item.uploaderAvatar || item.authorThumbnails?.[0]?.url;
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
        artist: result.author || t("home.unknownArtist"),
        artistId: normalizeArtistRouteId(result.authorId || result.uploaderUrl),
        artistImage: result.uploaderAvatar || result.authorThumbnails?.[0]?.url,
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
          artist: item.author || t("home.unknownArtist"),
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
  const localizedSourceFilters = useMemo(
    () =>
      sourceFilters.map((source) => ({
        ...source,
        label:
          source.id === "spotify"
            ? t("source.spotify")
            : getSourceLabel(source.id as PreferredSearchSource),
      })),
    [getSourceLabel, sourceFilters, t]
  );
  const localizedFilterOptions = useMemo(
    () =>
      currentFilterOptions.map((filter) => ({
        ...filter,
        label:
          filter.value === "all"
            ? t("search.all")
            : filter.value === "videos"
            ? t("search.videos")
            : filter.value === "channels" || filter.value === "artists"
            ? t("search.artists")
            : filter.value === "playlists"
            ? t("search.playlists")
            : filter.value === "albums"
            ? t("search.albums")
            : filter.value === "songs"
            ? t("search.songs")
            : filter.value === "tracks"
            ? t("search.tracks")
            : filter.label,
      })),
    [currentFilterOptions, t]
  );

  return (
    <div className="h-full text-white flex flex-col overflow-hidden">
      <SearchInput
        value={searchQuery}
        onChange={handleTextChange}
        onSearch={() => handleSearch()}
        onClear={clearSearch}
        onFocus={() => showHistorySuggestions(searchQueryRef.current)}
        onFilterToggle={() => setShowFilters((prev) => !prev)}
        placeholder={t("search.placeholder", {
          source:
            localizedSourceFilters.find((s) => s.id === selectedSource)
              ?.label || getSourceLabel("mixed"),
        })}
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
        sourceFilters={localizedSourceFilters}
        selectedSource={selectedSource}
        onSourceSelect={handleSourceSelect}
        filterOptions={localizedFilterOptions}
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
