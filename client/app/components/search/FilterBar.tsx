import React from "react";
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
      <div className="overflow-x-auto whitespace-nowrap pb-2 hide-scrollbar">
        <div className="flex gap-2">
          {sourceFilters.map((source) => (
            <button
              key={source.id}
              onClick={() => source.id !== "spotify" && onSourceSelect(source.id)}
              disabled={source.id === "spotify"}
              className={`px-5 h-9 rounded-full font-bold text-sm uppercase transition-colors ${
                selectedSource === source.id
                  ? "text-black"
                  : "bg-neutral-800 text-neutral-400"
              } ${
                source.id === "spotify" ? "opacity-50 cursor-not-allowed" : ""
              }`}
              style={{
                backgroundColor:
                  selectedSource === source.id ? source.color : undefined,
              }}
            >
              {source.label}
            </button>
          ))}
        </div>
      </div>

      {/* Sub-filters */}
      {showSubFilters && (
        <div className="overflow-x-auto whitespace-nowrap pb-3 hide-scrollbar">
          <div className="flex gap-2">
            {filterOptions.map((filter) => (
              <button
                key={filter.value}
                onClick={() => onFilterSelect(filter.value)}
                className={`px-4 h-8 rounded-full text-sm font-bold uppercase transition-colors ${
                  selectedFilter === filter.value
                    ? "bg-white text-black"
                    : "bg-neutral-800 text-white"
                }`}
              >
                {filter.label}
              </button>
            ))}
          </div>
        </div>
      )}
    </div>
  );
};
