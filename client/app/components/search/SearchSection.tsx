import React, { memo } from "react";
import { HorizontalScrollRow } from "../HorizontalScrollRow";
import { SearchResult, SourceType } from "./types";
import { ResultItem } from "./ResultItem";
import { ArtistCard } from "./ArtistCard";

interface SearchSectionProps {
  title: string;
  items: SearchResult[];
  onItemPress: (item: SearchResult) => void;
  isArtistsSection?: boolean;
  selectedSource?: SourceType;
}

export const SearchSection = memo<SearchSectionProps>(
  ({ title, items, onItemPress, isArtistsSection = false, selectedSource }) => {
    if (items.length === 0) return null;

    if (isArtistsSection) {
      return (
        <div className="mb-6">
          <h2
            className="mb-3 text-lg font-bold text-[color:var(--foreground)]"
            style={{ marginInlineStart: "0.25rem" }}
          >
            {title}
          </h2>
          <HorizontalScrollRow
            containerClassName="pb-2"
            containerStyle={{ paddingInlineEnd: "3rem" }}
            contentClassName="flex w-max gap-2"
          >
            {items.map((item) => (
              <ArtistCard
                key={`${item.source || "yt"}-${item.id}`}
                item={item}
                onPress={() => onItemPress(item)}
              />
            ))}
          </HorizontalScrollRow>
        </div>
      );
    }

    return (
      <div className="mb-4">
        <h2
          className="mb-2 text-lg font-bold text-[color:var(--foreground)]"
          style={{ marginInlineStart: "0.25rem" }}
        >
          {title}
        </h2>
        <div className="space-y-1">
          {items.map((item) => (
            <ResultItem
              key={`${item.source || "yt"}-${item.id}`}
              item={item}
              onPress={() => onItemPress(item)}
              selectedSource={selectedSource}
            />
          ))}
        </div>
      </div>
    );
  }
);
SearchSection.displayName = "SearchSection";
