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
  shortCount,
} from "../components/search";

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
  const { playSong } = useAudio();

  // State
  const [searchQuery, setSearchQuery] = useState(() => {
    const query = searchParams.get("q");
    return query || "";
  });
  const [suggestions, setSuggestions] = useState<string[]>([]);
  const [isLoadingSuggestions, setIsLoadingSuggestions] = useState(false);
  const [searchResults, setSearchResults] = useState<SearchResult[]>([]);
  const [isLoading, setIsLoading] = useState(false);
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

  // Restore search state from localStorage and perform initial search
  useEffect(() => {
    const query = searchParams.get("q");

    // If URL has search params, use them (this takes priority)
    if (query && !hasSearched && !isLoading) {
      handleSearch(query);
      return;
    }

    // If no URL params, try to restore from localStorage
    const savedSearch = localStorage.getItem("lastSearch");
    if (savedSearch && !hasSearched && !query && !isLoading) {
      try {
        const searchState = JSON.parse(savedSearch);
        const timestamp = searchState.timestamp || 0;

        // Only restore if state is recent (within 2 hours)
        const maxAge = 2 * 60 * 60 * 1000; // 2 hours
        if (Date.now() - timestamp < maxAge && searchState.query) {
          // Set the state first
          setSearchQuery(searchState.query);
          searchQueryRef.current = searchState.query;
          setSelectedSource(searchState.source || "youtube");
          selectedSourceRef.current = searchState.source || "youtube";
          setSelectedFilter(searchState.filter || "all");
          selectedFilterRef.current = searchState.filter || "all";
          setHasSearched(true);

          // Restore search results if available
          if (searchState.results && searchState.results.length > 0) {
            setSearchResults(searchState.results);
          } else {
            // If no saved results, perform the search
            setTimeout(() => {
              handleSearch(searchState.query);
            }, 100);
          }
        }
      } catch (error) {
        console.error("Error restoring search state:", error);
        localStorage.removeItem("lastSearch");
      }
    }
  }, []); // Only run on mount

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
      // Check if we should restore search state when navigating back
      const savedSearch = localStorage.getItem("lastSearch");
      if (savedSearch && !searchParams.get("q")) {
        try {
          const searchState = JSON.parse(savedSearch);
          const timestamp = searchState.timestamp || 0;
          const maxAgePopstate = 2 * 60 * 60 * 1000; // 2 hours

          if (Date.now() - timestamp < maxAgePopstate && searchState.query) {
            // Restore the search state without performing a new search
            setSearchQuery(searchState.query);
            searchQueryRef.current = searchState.query;
            setSelectedSource(searchState.source || "youtube");
            selectedSourceRef.current = searchState.source || "youtube";
            setSelectedFilter(searchState.filter || "all");
            selectedFilterRef.current = searchState.filter || "all";
            setHasSearched(true);

            if (searchState.results && searchState.results.length > 0) {
              setSearchResults(searchState.results);
            }
          }
        } catch (error) {
          console.error("Error restoring search state on popstate:", error);
        }
      }
    };

    window.addEventListener("popstate", handlePopState);
    return () => window.removeEventListener("popstate", handlePopState);
  }, [searchParams]);

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
    if (!thumbnailUrl && Array.isArray(raw.image) && raw.image.length > 0) {
      const bestImage =
        raw.image.find((entry) => entry?.quality === "500x500") || raw.image[0];
      thumbnailUrl = bestImage?.url || "";
    }
    if (!thumbnailUrl) {
      thumbnailUrl =
        raw.thumbnailUrl ||
        raw.thumbnail ||
        raw.videoThumbnails?.[0]?.url ||
        raw.img ||
        raw.artwork_url ||
        raw.artwork ||
        raw.user?.avatar_url ||
        "";
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

        // Save search state to localStorage
        saveSearchState();
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

  // Save current search state to localStorage
  const saveSearchState = useCallback(() => {
    if (searchQuery || hasSearched) {
      const searchState = {
        query: searchQuery,
        source: selectedSource,
        filter: selectedFilter,
        results: searchResults, // Save the actual results
        timestamp: Date.now(),
      };
      localStorage.setItem("lastSearch", JSON.stringify(searchState));
    }
  }, [searchQuery, selectedSource, selectedFilter, searchResults, hasSearched]);

  // ─── Navigation handlers ─────────────────────────────────
  const buildArtistUrl = (item: SearchResult) => {
    const name =
      item.title || item.author || item.name || (item as any).name || "";
    const image =
      item.thumbnailUrl ||
      item.img ||
      item.authorThumbnails?.[0]?.url ||
      item.thumbnail ||
      "";

    const params = new URLSearchParams();
    if (name) params.set("name", name);
    if (image) params.set("image", image);

    // Preserve search state
    if (searchQuery) params.set("search_query", searchQuery);
    if (selectedSource !== "youtube")
      params.set("search_source", selectedSource);
    if (selectedFilter !== "all") params.set("search_filter", selectedFilter);

    const qs = params.toString();
    return `/artist/${item.id}${qs ? `?${qs}` : ""}`;
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
    router.push(`/album/${item.id}`);
  };
  const handleSongPress = async (item: SearchResult) => {
    // Save search state before navigation
    saveSearchState();

    try {
      // Fetch actual video details with audio URL
      const response = await fetch(`/api/video?id=${item.id}`);
      const videoData = await response.json();

      if (videoData.audioUrl) {
        // Play the song using the actual YouTube audio URL
        const song = {
          id: item.id,
          title: item.title,
          artist: item.author || "Unknown Artist",
          coverUrl: item.thumbnailUrl || item.img || item.thumbnail,
          audioUrl: videoData.audioUrl,
          duration: videoData.lengthSeconds
            ? parseInt(videoData.lengthSeconds)
            : undefined,
          cachedAt: Date.now(),
        };

        playSong(song);
        console.log(
          "Playing song:",
          item.title,
          "with audio URL:",
          videoData.audioUrl
        );
      } else {
        console.error("No audio URL found for video:", item.id);
      }
    } catch (error) {
      console.error("Failed to fetch video details:", error);
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
