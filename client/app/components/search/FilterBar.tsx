import React from "react";
import { HorizontalScrollRow } from "../HorizontalScrollRow";
import { SourceType, SourceFilter, FilterOption } from "./types";

interface FilterBarProps {
  showFilters: boolean;
  sourceFilters: SourceFilter[];
  selectedSource: SourceType;
  onSourceSelect: (sourceId: SourceType) => void;
  filterOptions: FilterOption[];
  selectedFilter: string;
  onFilterSelect: (filterValue: string) => void;
}

export const FilterBar: React.FC<FilterBarProps> = ({
  showFilters,
  sourceFilters,
  selectedSource,
  onSourceSelect,
  filterOptions,
  selectedFilter,
  onFilterSelect,
}) => {
  const showSubFilters = filterOptions.length > 0;

  return (
    <div
      className={`overflow-hidden transition-all duration-300 ease-out  ${
        showFilters ? "mb-3 max-h-96 opacity-100 pb-2" : "mb-0 max-h-0 opacity-0"
      }`}
    >
      {/* Source filters */}
      <HorizontalScrollRow
        containerClassName="whitespace-nowrap pb-2"
        containerStyle={{ paddingInlineEnd: "3rem" }}
        contentClassName="flex w-max gap-2"
      >
        {sourceFilters.map((source) => (
          <button
            key={source.id}
            onClick={() => source.id !== "spotify" && onSourceSelect(source.id)}
            disabled={source.id === "spotify"}
            className={`h-9 rounded-full border px-5 text-sm font-bold uppercase transition-colors ${
              selectedSource === source.id
                ? "text-[color:var(--theme-accent-contrast)]"
                : "theme-button-soft text-[color:color-mix(in_srgb,var(--foreground)_70%,transparent)]"
            } ${source.id === "spotify" ? "opacity-50 cursor-not-allowed" : ""}`}
            style={{
              backgroundColor:
                selectedSource === source.id ? source.color : undefined,
            }}
          >
            {source.label}
          </button>
        ))}
      </HorizontalScrollRow>

      {/* Sub-filters */}
      {showSubFilters && (
        <HorizontalScrollRow
          containerClassName="whitespace-nowrap pb-3"
          containerStyle={{ paddingInlineEnd: "3rem" }}
          contentClassName="flex w-max gap-2"
        >
          {filterOptions.map((filter) => (
            <button
              key={filter.value}
              onClick={() => onFilterSelect(filter.value)}
              className={`h-8 rounded-full border px-4 text-sm font-bold uppercase transition-colors ${
                selectedFilter === filter.value
                  ? "theme-button-accent border-transparent"
                  : "theme-button-soft"
              }`}
            >
              {filter.label}
            </button>
          ))}
        </HorizontalScrollRow>
      )}
    </div>
  );
};
