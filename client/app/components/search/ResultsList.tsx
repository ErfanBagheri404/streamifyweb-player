import React from "react";
import Image from "next/image";
import { useAppLanguage } from "../../hooks/useAppLanguage";
import {
  SEARCH_CATEGORY_PLAYLISTS,
  type SearchCategoryPlaylist,
} from "../../lib/search-category-playlists";
import { SearchResult, SourceType } from "./types";
import { SearchSection } from "./SearchSection";
import { SkeletonItem } from "./SkeletonItem";

interface ResultsListProps {
  isLoading: boolean;
  hasSearched: boolean;
  searchResults: SearchResult[];
  selectedSource: SourceType;
  searchQuery: string;
  isLoadingMore: boolean;
  hasMoreResults: boolean;
  onLoadMore: () => void;
  filteredResults: {
    topResults: SearchResult[];
    artists: SearchResult[];
    albums: SearchResult[];
    playlists: SearchResult[];
    songs: SearchResult[];
  };
  onTopResultPress: (item: SearchResult) => void;
  onArtistPress: (item: SearchResult) => void;
  onAlbumPress: (item: SearchResult) => void;
  onSongPress: (item: SearchResult) => void;
  onCategorySelect?: (category: SearchCategoryPlaylist) => void;
}

export const ResultsList: React.FC<ResultsListProps> = ({
  isLoading,
  hasSearched,
  searchResults,
  selectedSource,
  searchQuery,
  isLoadingMore,
  hasMoreResults,
  onLoadMore,
  filteredResults,
  onTopResultPress,
  onArtistPress,
  onAlbumPress,
  onSongPress,
  onCategorySelect,
}) => {
  const { t, getCategoryLabel } = useAppLanguage();

  if (isLoading) {
    return (
      <div className="space-y-2">
        {[...Array(6)].map((_, i) => (
          <SkeletonItem key={i} selectedSource={selectedSource} />
        ))}
      </div>
    );
  }

  if (!searchQuery.trim()) {
    return (
      <div className="grid grid-cols-2 gap-2 px-1 py-4 sm:grid-cols-3">
        {SEARCH_CATEGORY_PLAYLISTS.map((category) => {
          const label = getCategoryLabel(category.category);
          const src = `/categories/${encodeURIComponent(category.imageFileName)}`;
          return (
            <button
              key={category.category}
              type="button"
              onClick={() => onCategorySelect?.(category)}
              className="group relative w-full overflow-hidden rounded-xl"
            >
              <Image
                src={src}
                alt={label}
                width={300}
                height={200}
                className="aspect-[3/2] w-full object-cover theme-surface-strong"
                unoptimized
              />
              <div className="absolute inset-0 bg-gradient-to-t from-black/70 via-black/20 to-transparent transition group-hover:from-black/78" />
              <div
                className="absolute bottom-4 left-4 right-4 text-lg font-bold sm:bottom-5 sm:left-5 sm:right-5 sm:text-xl"
                style={{
                  color: "#ffffff",
                  textShadow: "0 2px 10px rgba(0,0,0,0.45)",
                }}
              >
                {label}
              </div>
            </button>
          );
        })}
      </div>
    );
  }

  if (searchQuery.trim() && hasSearched && searchResults.length === 0) {
    return (
      <p className="mt-8 text-center text-[color:color-mix(in_srgb,var(--foreground)_48%,transparent)]">
        {t("search.noResults")}
      </p>
    );
  }

  if (searchResults.length === 0) return null;

  return (
    <>
      <SearchSection
        title={t("search.topResult")}
        items={filteredResults.topResults}
        onItemPress={onTopResultPress}
        selectedSource={selectedSource}
      />
      <SearchSection
        title={t("search.artists")}
        items={filteredResults.artists}
        onItemPress={onArtistPress}
        isArtistsSection={true}
        selectedSource={selectedSource}
      />
      {selectedSource !== "youtube" && selectedSource !== "youtubemusic" && (
        <SearchSection
          title={t("search.albums")}
          items={filteredResults.albums}
          onItemPress={onAlbumPress}
          selectedSource={selectedSource}
        />
      )}
      <SearchSection
        title={t("search.playlists")}
        items={filteredResults.playlists}
        onItemPress={onAlbumPress}
        selectedSource={selectedSource}
      />
      <SearchSection
        title={t("search.songs")}
        items={filteredResults.songs}
        onItemPress={onSongPress}
        selectedSource={selectedSource}
      />

      {!hasMoreResults ? (
        <div className="py-5 text-center">
          <span className="theme-muted text-sm">
            {t("search.endResults")}
          </span>
        </div>
      ) : (
        <div className="py-5 text-center">
          {isLoadingMore ? (
            <div className="theme-muted inline-flex items-center gap-3 rounded-full px-4 py-2 text-sm">
              <span className="theme-spinner h-5 w-5" />
              <span className="loading-dots">{t("common.loadingMore")}</span>
            </div>
          ) : (
            <button
              onClick={onLoadMore}
              className="theme-button-soft rounded-full border px-6 py-2.5 text-sm font-semibold transition"
            >
              {t("common.loadMore")}
            </button>
          )}
        </div>
      )}
    </>
  );
};
