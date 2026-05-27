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
    <>
      <div className="absolute top-28 left-4 right-4 bg-neutral-800 rounded-xl shadow-lg z-50 overflow-hidden">
        {isLoading && suggestions.length === 0 && (
          <div className="px-4 py-3.5 text-neutral-400 text-center">
            <span className="inline-block w-5 h-5 border-2 border-neutral-500 border-t-transparent rounded-full animate-spin" />
          </div>
        )}
        {suggestions.map((item, index) => (
          <button
            key={index}
            onClick={() => {
              onSelect(item);
              onClose();
            }}
            className="w-full text-left px-4 py-3.5 flex items-center border-b border-neutral-700 last:border-0 hover:bg-neutral-700"
          >
            <span className="text-neutral-400 mr-3">🔍</span>
            <span className="text-white">{item}</span>
          </button>
        ))}
      </div>
      <div className="fixed inset-0 z-40" onClick={onClose} />
    </>
  );
};
