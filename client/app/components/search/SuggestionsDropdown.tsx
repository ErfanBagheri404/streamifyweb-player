import React from "react";
import { useAppLanguage } from "../../hooks/useAppLanguage";

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
  const { t } = useAppLanguage();

  if (suggestions.length === 0 && !isLoading) return null;

  return (
    <div className="theme-surface theme-shadow-strong absolute left-0 right-0 top-[calc(100%+4px)] z-50 overflow-hidden rounded-2xl border">
      <div className="flex items-center justify-end border-b border-[color:var(--border-subtle)] px-3 py-2">
        <button
          type="button"
          onClick={onClose}
          className="theme-muted rounded-full px-2.5 py-1 text-[11px] font-medium uppercase tracking-[0.16em] transition hover:bg-[color:color-mix(in_srgb,var(--foreground)_6%,transparent)] hover:text-[color:var(--foreground)]"
        >
          {t("common.close")}
        </button>
      </div>

      {isLoading && suggestions.length === 0 && (
        <div className="theme-muted px-4 py-6 text-center">
          <span className="theme-spinner inline-block h-5 w-5" />
        </div>
      )}

      {suggestions.length > 0 && (
        <ul className="py-1" role="listbox">
          {suggestions.map((item, index) => (
            <li
              key={`${item}-${index}`}
              className="border-b border-[color:var(--border-subtle)] last:border-b-0"
            >
              <button
                type="button"
                onClick={() => {
                  onSelect(item);
                  onClose();
                }}
                className="block w-full px-4 py-3.5 text-left transition-colors hover:bg-[color:color-mix(in_srgb,var(--foreground)_6%,transparent)]"
              >
                <div className="flex items-center justify-between gap-3">
                  <p className="truncate text-sm font-medium text-[color:var(--foreground)]">
                    {item}
                  </p>
                  <span className="shrink-0 text-[11px] uppercase tracking-[0.16em] text-[color:color-mix(in_srgb,var(--foreground)_25%,transparent)]">
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
