"use client";

import React, {
  useState,
  useCallback,
  useRef,
  useMemo,
  useEffect,
} from "react";
import { useRouter } from "next/navigation";
import {
  SearchInput,
  FilterBar,
  SuggestionsDropdown,
  ResultsList,
  SourceType,
  SearchResult,
  sourceFilters as defaultSourceFilters,
  getFilterOptions,
  shortCount,
} from "../components/search";

// ─── Raw Piped item shape (partial) ────────────────────────
interface RawPipedItem {
  url?: string;
  type?: string;
  title?: string;
  thumbnail?: string;
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
  videoThumbnails?: { url: string }[];
  img?: string;
  authorThumbnails?: { url: string }[];
  lengthSeconds?: number;
  videoCount?: number;
  channelDescription?: string;
  description?: string;
  verified?: boolean;
  subCount?: number;
}

export default function SearchPage() {
  const router = useRouter();

  // State
  const [searchQuery, setSearchQuery] = useState("");
  const [suggestions, setSuggestions] = useState<string[]>([]);
  const [isLoadingSuggestions, setIsLoadingSuggestions] = useState(false);
  const [searchResults, setSearchResults] = useState<SearchResult[]>([]);
  const [isLoading, setIsLoading] = useState(false);
  const [hasSearched, setHasSearched] = useState(false);
  const [isLoadingMore, setIsLoadingMore] = useState(false);
  const [hasMoreResults, setHasMoreResults] = useState(true);
  const [currentPage, setCurrentPage] = useState(1);

  const [selectedSource, setSelectedSource] = useState<SourceType>("youtube");
  const [selectedFilter, setSelectedFilter] = useState("all");
  const [showFilters, setShowFilters] = useState(false);
  const [sourceFilters, setSourceFilters] = useState(defaultSourceFilters);

  // Refs
  const selectedFilterRef = useRef(selectedFilter);
  const selectedSourceRef = useRef(selectedSource);
  const searchQueryRef = useRef(searchQuery);
  const abortControllerRef = useRef<AbortController | null>(null);

  useEffect(() => {
    selectedFilterRef.current = selectedFilter;
  }, [selectedFilter]);
  useEffect(() => {
    selectedSourceRef.current = selectedSource;
  }, [selectedSource]);
  useEffect(() => {
    searchQueryRef.current = searchQuery;
  }, [searchQuery]);

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

  // ─── Fetch suggestions from Piped API ────────────────
  const fetchSuggestions = async (query: string, source: SourceType) => {
    // Only fetch suggestions for YouTube sources
    if (source !== "youtube" && source !== "youtubemusic") {
      return [];
    }

    try {
      const response = await fetch(
        `https://api.piped.private.coffee/opensearch/suggestions?query=${encodeURIComponent(
          query
        )}`,
        { signal: abortControllerRef.current?.signal }
      );

      if (!response.ok) {
        throw new Error(`HTTP error! status: ${response.status}`);
      }

      const data = await response.json();
      // Piped returns an array where first element is query, rest are suggestions
      if (Array.isArray(data) && data.length > 1) {
        return data.slice(1) as string[];
      }
      return [];
    } catch (error) {
      if ((error as Error).name !== "AbortError") {
        console.error("Error fetching suggestions:", error);
      }
      return [];
    }
  };

  // ─── Helper: map raw item to SearchResult ────────────────
  const mapToSearchResult = (raw: RawPipedItem): SearchResult => {
    const id =
      raw.url?.split("v=")[1] ||
      raw.url ||
      raw.videoId ||
      raw.playlistId ||
      raw.authorId ||
      raw.id ||
      "";

    // For channel/artist thumbnails, find the highest quality (512x512 or largest available)
    let thumbnailUrl = "";
    if (raw.authorThumbnails && raw.authorThumbnails.length > 0) {
      // Sort by width descending to get highest quality
      const sorted = [...raw.authorThumbnails].sort(
        (a, b) => (b.width || 0) - (a.width || 0)
      );
      thumbnailUrl = sorted[0]?.url || "";
    }
    if (!thumbnailUrl) {
      thumbnailUrl =
        raw.thumbnail || raw.videoThumbnails?.[0]?.url || raw.img || "";
    }

    const author = raw.uploaderName || raw.author || raw.artist || "";

    const duration = String(raw.duration ?? raw.lengthSeconds ?? "0");

    const views =
      raw.views != null ? shortCount(String(raw.views)) + " views" : undefined;

    let uploaded: string | number | undefined = raw.uploadedDate;
    if (!uploaded && raw.uploaded != null) {
      if (typeof raw.uploaded === "string") {
        uploaded =
          raw.uploaded.replace(/(\[\d.\]+\['MKB'\]?)\s*views?\s*•?\s*/i, "") ||
          raw.uploaded;
      } else {
        uploaded = raw.uploaded; // timestamp number
      }
    }

    // Map type – Piped uses "stream" for videos, "channel" for artists
    let mappedType = raw.type ?? "video";
    if (mappedType === "stream") mappedType = "video";
    if (mappedType === "channel") mappedType = "artist";

    // For channels/artists, the "title" from Piped is often empty, use "author" as the name
    const displayTitle =
      mappedType === "artist" && !raw.title
        ? raw.author || raw.uploaderName || ""
        : raw.title || "";

    return {
      id,
      source: "youtube" as const,
      title: displayTitle,
      author,
      duration,
      views: views || "",
      thumbnailUrl,
      uploaded,
      type: mappedType,
      // Keep original fields for potential use
      ...raw,
    } as SearchResult;
  };

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
        let url = `http://localhost:3001/search?q=${encodeURIComponent(
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
    [searchResults.length, currentPage]
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
          // Piped returns: ["query", "suggestion1", "suggestion2", ...]
          if (Array.isArray(data) && data.length > 1) {
            setSuggestions(data.slice(1, 8)); // Take up to 7 suggestions
          } else {
            setSuggestions([]);
          }
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
  };

  // ─── Navigation handlers ─────────────────────────────────
  const handleTopResultPress = (item: SearchResult) => {
    if (item.source === "youtube_channel" || item.type === "artist") {
      router.push(`/artist/${item.id}`);
    } else {
      console.log("Play:", item.title);
    }
  };
  const handleArtistPress = (item: SearchResult) =>
    router.push(`/artist/${item.id}`);
  const handleAlbumPress = (item: SearchResult) =>
    router.push(`/album/${item.id}`);
  const handleSongPress = (item: SearchResult) =>
    console.log("Play song:", item.title);

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
    <div className="min-h-screen text-white">
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
      />
      <FilterBar
        showFilters={showFilters}
        sourceFilters={sourceFilters}
        selectedSource={selectedSource}
        onSourceSelect={handleSourceSelect}
        filterOptions={currentFilterOptions}
        selectedFilter={selectedFilter}
        onFilterSelect={handleFilterSelect}
      />

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

      <div
        ref={scrollContainerRef}
        className="flex-1 overflow-y-auto hide-scrollbar h-full"
        style={{ maxHeight: "calc(100vh - 180px)" }}
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
        />
      </div>
    </div>
  );
}
