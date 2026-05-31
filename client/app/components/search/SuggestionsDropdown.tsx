import React from "react";

interface SuggestionsDropdownProps {
  suggestions: string[];
  onSelect: (suggestion: string) => void;
  onClose: () => void;
  isLoading?: boolean;
}

export const SuggestionsDropdown: React.FC<SuggestionsDropdownProps> = ({
  suggestions,
  onSelect,
  onClose,
  isLoading = false,
}) => {
  if (suggestions.length === 0 && !isLoading) return null;

  return (
    <div className="absolute left-0 right-0 top-[calc(100%+4px)] z-50 overflow-hidden rounded-2xl border border-white/8 bg-[#181818] shadow-[0_18px_48px_rgba(0,0,0,0.32)]">
      <div className="flex items-center justify-end border-b border-white/6 px-3 py-2">
        <button
          type="button"
          onClick={onClose}
          className="rounded-full px-2.5 py-1 text-[11px] font-medium uppercase tracking-[0.16em] text-white/45 transition hover:bg-white/6 hover:text-white"
        >
          Close
        </button>
      </div>

      {isLoading && suggestions.length === 0 && (
        <div className="px-4 py-6 text-center text-neutral-400">
          <span className="inline-block h-5 w-5 rounded-full border-2 border-neutral-500 border-t-transparent animate-spin" />
        </div>
      )}

      {suggestions.length > 0 && (
        <ul className="py-1" role="listbox">
          {suggestions.map((item, index) => (
            <li
              key={`${item}-${index}`}
              className="border-b border-white/6 last:border-b-0"
            >
              <button
                type="button"
                onClick={() => {
                  onSelect(item);
                  onClose();
                }}
                className="block w-full px-4 py-3.5 text-left transition-colors hover:bg-white/6"
              >
                <div className="flex items-center justify-between gap-3">
                  <p className="truncate text-sm font-medium text-white">{item}</p>
                  <span className="shrink-0 text-[11px] uppercase tracking-[0.16em] text-white/25">
                  {String(index + 1).padStart(2, "0")}
                  </span>
                </div>
              </button>
            </li>
          ))}
        </ul>
      )}
    </div>
  );
};
