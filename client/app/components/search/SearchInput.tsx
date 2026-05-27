import React from "react";
import Image from "next/image";

interface SearchInputProps {
  value: string;
  onChange: (text: string) => void;
  onSearch: () => void;
  onClear: () => void;
  onFocus: () => void;
  onFilterToggle: () => void;   // <-- added
  placeholder: string;
}

export const SearchInput: React.FC<SearchInputProps> = ({
  value,
  onChange,
  onSearch,
  onClear,
  onFocus,
  onFilterToggle,               // <-- destructure
  placeholder,
}) => {
  return (
    <div className="flex items-center pb-4 gap-3">
      <div className="flex-1 flex items-center bg-[#181818] rounded-xl">
        <input
          type="text"
          placeholder={placeholder}
          className="flex-1 py-4 px-4 bg-transparent text-white text-base placeholder-neutral-400 outline-none"
          value={value}
          onChange={(e) => onChange(e.target.value)}
          onFocus={onFocus}
          onKeyDown={(e) => e.key === "Enter" && onSearch()}
        />
        {value.length > 0 && (
          <button
            onClick={onClear}
            className="p-2 mr-1 text-neutral-400 hover:text-white"
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
      <button
        onClick={onFilterToggle}   // <-- now toggles filters
        className="cursor-pointer focus:outline-none"
        aria-label="Toggle filters"
      >
        <Image src="/Filter.svg" alt="Filter" width={25} height={25} />
      </button>
    </div>
  );
};