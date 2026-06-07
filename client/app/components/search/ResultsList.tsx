import React from "react";
import Image from "next/image";
import { useAppLanguage } from "../../hooks/useAppLanguage";
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
  onCategorySelect?: (category: string) => void;
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
    const categories = [
      "Alternative.jpg",
      "Electronic.jpg",
      "Heavy Metal.jpg",
      "Hip-Hop.jpg",
      "Jazz.jpg",
      "K-Pop.jpg",
      "LO-FI.jpg",
      "Metal.jpg",
      "OST.jpg",
      "Persian.jpg",
      "Phonk.jpg",
      "Pop.jpg",
      "R&B.jpg",
      "Rock.jpg",
      "Synthwave.jpg",
    ];

    return (
      <div className="grid grid-cols-2 gap-2 px-1 py-4 sm:grid-cols-3">
        {categories.map((fileName) => {
          const rawLabel = fileName.replace(/\.jpg$/i, "");
          const label = getCategoryLabel(rawLabel);
          const src = `/categories/${encodeURIComponent(fileName)}`;
          return (
            <button
              key={fileName}
              type="button"
              onClick={() => onCategorySelect?.(rawLabel)}
              className="relative w-full overflow-hidden rounded-xl"
            >
              <Image
                src={src}
                alt={label}
                width={300}
                height={200}
                className="w-full aspect-[3/2] object-cover bg-neutral-800"
                unoptimized
              />
              <div className="absolute bottom-4 left-4 text-lg font-bold text-white sm:bottom-5 sm:left-5 sm:text-xl">
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
      <p className="mt-8 text-center text-white/48">{t("search.noResults")}</p>
    );
  }

  if (searchResults.length === 0) return null;

  return (
    <>
      <SearchSection
        title={t("search.topResult")}
        items={filteredResults.topResults}
        onItemPress={onTopResultPress}
      />
      <SearchSection
        title={t("search.artists")}
        items={filteredResults.artists}
        onItemPress={onArtistPress}
        isArtistsSection={true}
      />
      {selectedSource !== "youtube" && selectedSource !== "youtubemusic" && (
        <SearchSection
          title={t("search.albums")}
          items={filteredResults.albums}
          onItemPress={onAlbumPress}
        />
      )}
      <SearchSection
        title={t("search.playlists")}
        items={filteredResults.playlists}
        onItemPress={onAlbumPress}
      />
      <SearchSection
        title={t("search.songs")}
        items={filteredResults.songs}
        onItemPress={onSongPress}
      />

      {!hasMoreResults ? (
        <div className="py-5 text-center">
          <span className="text-sm text-white/45">
            {t("search.endResults")}
          </span>
        </div>
      ) : (
        <div className="py-5 text-center">
          {isLoadingMore ? (
            <div className="inline-flex items-center gap-3 rounded-full px-4 py-2 text-sm text-white/65">
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
