import React from "react";
import Image from "next/image";
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
  if (isLoading) {
    return (
      <div className="space-y-2">
        {[...Array(6)].map((_, i) => (
          <SkeletonItem key={i} />
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
      <div className="grid grid-cols-3 gap-2 px-1 py-4">
        {categories.map((fileName) => {
          const label = fileName.replace(/\.jpg$/i, "");
          const src = `/categories/${encodeURIComponent(fileName)}`;
          return (
            <button
              key={fileName}
              type="button"
              onClick={() => onCategorySelect?.(label)}
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
              <div className="absolute bottom-5 left-5 text-white text-xl font-bold">
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
      <p className="text-neutral-400 text-center mt-8">No results found</p>
    );
  }

  if (searchResults.length === 0) return null;

  return (
    <>
      <SearchSection
        title="Top Result"
        items={filteredResults.topResults}
        onItemPress={onTopResultPress}
      />
      <SearchSection
        title="Artists"
        items={filteredResults.artists}
        onItemPress={onArtistPress}
        isArtistsSection={true}
      />
      {selectedSource !== "youtube" && selectedSource !== "youtubemusic" && (
        <SearchSection
          title="Albums"
          items={filteredResults.albums}
          onItemPress={onAlbumPress}
        />
      )}
      <SearchSection
        title="Playlists"
        items={filteredResults.playlists}
        onItemPress={onAlbumPress}
      />
      <SearchSection
        title="Songs"
        items={filteredResults.songs}
        onItemPress={onSongPress}
      />

      {!hasMoreResults ? (
        <div className="py-5 text-center">
          <span className="text-neutral-400 text-sm">
            End of search results
          </span>
        </div>
      ) : (
        <div className="py-5 text-center">
          {isLoadingMore ? (
            <div className="inline-block w-6 h-6 border-2 border-white border-t-transparent rounded-full animate-spin" />
          ) : (
            <button
              onClick={onLoadMore}
              className="bg-neutral-800 hover:bg-neutral-700 px-6 py-2.5 rounded-full text-white text-sm"
            >
              Load More
            </button>
          )}
        </div>
      )}
    </>
  );
};
