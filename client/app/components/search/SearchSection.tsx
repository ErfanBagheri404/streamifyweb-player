import React, { memo } from "react";
import { SearchResult } from "./types";
import { ResultItem } from "./ResultItem";
import { ArtistCard } from "./ArtistCard";

interface SearchSectionProps {
  title: string;
  items: SearchResult[];
  onItemPress: (item: SearchResult) => void;
  isArtistsSection?: boolean;
}

export const SearchSection = memo<SearchSectionProps>(
  ({ title, items, onItemPress, isArtistsSection = false }) => {
    if (items.length === 0) return null;

    // Artists section uses horizontal scroll layout
    if (isArtistsSection) {
      return (
        <div className="mb-6">
          <h2 className="text-white text-lg font-bold mb-3 ml-1">{title}</h2>
          <div className="flex gap-2 overflow-x-auto pb-2 scrollbar-hide">
            {items.map((item) => (
              <ArtistCard
                key={`${item.source || "yt"}-${item.id}`}
                item={item}
                onPress={() => onItemPress(item)}
              />
            ))}
          </div>
        </div>
      );
    }

    // Default vertical list layout
    return (
      <div className="mb-4">
        <h2 className="text-white text-lg font-bold mb-2 ml-1">{title}</h2>
        <div className="space-y-1">
          {items.map((item) => (
            <ResultItem
              key={`${item.source || "yt"}-${item.id}`}
              item={item}
              onPress={() => onItemPress(item)}
            />
          ))}
        </div>
      </div>
    );
  }
);
SearchSection.displayName = "SearchSection";
