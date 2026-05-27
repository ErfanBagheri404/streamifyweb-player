import React from "react";
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

  if (hasSearched && searchResults.length === 0) {
    return <p className="text-neutral-400 text-center mt-8">No results found</p>;
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

      {!searchQuery.trim() ? (
        <div className="py-5" />
      ) : (
        <>
          {!hasMoreResults ? (
            <div className="py-5 text-center">
              <span className="text-neutral-400 text-sm">End of search results</span>
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
      )}
    </>
  );
};
