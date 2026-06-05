import React from "react";
import Image from "next/image";

interface SearchInputProps {
  value: string;
  onChange: (text: string) => void;
  onSearch: () => void;
  onClear: () => void;
  onFocus: () => void;
  onFilterToggle: () => void; // <-- added
  placeholder: string;
  children?: React.ReactNode;
}

export const SearchInput: React.FC<SearchInputProps> = ({
  value,
  onChange,
  onSearch,
  onClear,
  onFocus,
  onFilterToggle, // <-- destructure
  placeholder,
  children,
}) => {
  return (
    <div className="flex items-center gap-3 pb-4">
      <div className="relative flex-1">
        <div className="theme-surface flex items-center rounded-xl border shadow-[0_12px_30px_rgba(0,0,0,0.18)]">
          <input
            type="text"
            placeholder={placeholder}
            className="theme-input flex-1 rounded-xl border-0 bg-transparent px-4 py-4 text-base outline-none"
            value={value}
            onChange={(e) => onChange(e.target.value)}
            onFocus={onFocus}
            onKeyDown={(e) => e.key === "Enter" && onSearch()}
          />
          {value.length > 0 && (
            <button
              onClick={onClear}
              className="mr-1 rounded-full p-2 text-white/40 transition hover:bg-white/6 hover:text-white"
              aria-label="Clear search"
            >
              <svg
                xmlns="http://www.w3.org/2000/svg"
                className="h-5 w-5"
                viewBox="0 0 20 20"
                fill="currentColor"
              >
                <path
                  fillRule="evenodd"
                  d="M10 18a8 8 0 100-16 8 8 0 000 16zM8.707 7.293a1 1 0 00-1.414 1.414L8.586 10l-1.293 1.293a1 1 0 101.414 1.414L10 11.414l1.293 1.293a1 1 0 001.414-1.414L11.414 10l1.293-1.293a1 1 0 00-1.414-1.414L10 8.586 8.707 7.293z"
                  clipRule="evenodd"
                />
              </svg>
            </button>
          )}
        </div>
        {children}
      </div>
      <button
        onClick={onFilterToggle} // <-- now toggles filters
        className="theme-button-soft flex h-11 w-11 items-center justify-center rounded-xl border transition focus:outline-none"
        aria-label="Toggle filters"
      >
        <Image src="/Filter.svg" alt="Filter" width={22} height={22} />
      </button>
    </div>
  );
};
