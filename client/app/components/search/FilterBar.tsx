import React from "react";
import { HorizontalScrollRow } from "../HorizontalScrollRow";
import SourceIcon from "../SourceIcon";
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
        showFilters
          ? "mb-3 max-h-96 opacity-100 pb-2"
          : "mb-0 max-h-0 opacity-0"
      }`}
    >
      {/* Source filters */}
      <HorizontalScrollRow
        containerClassName="whitespace-nowrap pb-2"
        containerStyle={{ paddingInlineEnd: "3rem" }}
        contentClassName="flex w-max gap-2"
      >
        {sourceFilters.map((source) =>
          (() => {
            const isSelected = selectedSource === source.id && !source.disabled;

            return (
              <button
                key={source.id}
                disabled={source.disabled}
                onClick={() => onSourceSelect(source.id)}
                className={`flex h-9 items-center gap-2 rounded-full border px-4 text-sm font-bold uppercase leading-none transition-colors ${
                  isSelected
                    ? "text-[color:var(--foreground)]"
                    : source.disabled
                      ? "cursor-not-allowed border-[color:color-mix(in_srgb,var(--foreground)_12%,transparent)] bg-[color:color-mix(in_srgb,var(--foreground)_6%,transparent)] text-[color:color-mix(in_srgb,var(--foreground)_35%,transparent)]"
                      : "theme-button-soft text-[color:color-mix(in_srgb,var(--foreground)_70%,transparent)]"
                }`}
                style={{
                  backgroundColor: isSelected
                    ? `color-mix(in srgb, ${source.color} 18%, transparent)`
                    : undefined,
                  borderColor: isSelected
                    ? `color-mix(in srgb, ${source.color} 42%, var(--border-subtle))`
                    : undefined,
                }}
              >
                <SourceIcon
                  source={source.id}
                  size={source.id === "mixed" ? 14 : 16}
                  className={`${source.id === "mixed" ? "h-3.5 w-3.5" : "h-4 w-4"} flex-shrink-0 object-contain ${
                    source.disabled ? "opacity-50" : ""
                  }`}
                />
                <span className="inline-flex items-center leading-none">
                  {source.label}
                </span>
              </button>
            );
          })(),
        )}
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
