"use client";

import { useEffect } from "react";
import { useAppLanguage } from "../hooks/useAppLanguage";

export default function PlaylistImportModal({
  open,
  url,
  error,
  isImporting,
  onUrlChange,
  onClose,
  onSubmit,
}: {
  open: boolean;
  url: string;
  error: string;
  isImporting: boolean;
  onUrlChange: (value: string) => void;
  onClose: () => void;
  onSubmit: () => void;
}) {
  const { t } = useAppLanguage();
  const canSubmit = url.trim().length > 0 && !isImporting;

  useEffect(() => {
    if (!open) return;

    const handleKeyDown = (event: KeyboardEvent) => {
      if (event.key === "Escape") {
        onClose();
      }
    };

    window.addEventListener("keydown", handleKeyDown);
    return () => {
      window.removeEventListener("keydown", handleKeyDown);
    };
  }, [onClose, open]);

  return (
    <div
      className={`fixed inset-0 z-[70] flex items-center justify-center px-4 py-4 transition-all duration-200 ${
        open
          ? "pointer-events-auto opacity-100"
          : "pointer-events-none opacity-0"
      }`}
      style={{
        background: open ? "rgba(0, 0, 0, 0.62)" : "transparent",
        backdropFilter: open ? "blur(10px)" : "blur(0px)",
      }}
      onClick={open ? onClose : undefined}
      aria-hidden={!open}
    >
      <div
        className={`theme-surface w-full max-w-md rounded-2xl border p-5 text-[color:var(--foreground)] transition-all duration-200 ${
          open ? "translate-y-0 scale-100" : "translate-y-3 scale-[0.97]"
        }`}
        onClick={(event) => event.stopPropagation()}
      >
        <div className="flex items-start justify-between gap-4">
          <div>
            <h2 className="text-xl font-bold text-[color:var(--foreground)]">
              {t("library.importPlaylistTitle")}
            </h2>
            <p
              className="mt-1 text-sm"
              style={{ color: "var(--muted-foreground)" }}
            >
              {t("library.importPlaylistDescription")}
            </p>
          </div>
          <button
            type="button"
            onClick={onClose}
            className="rounded-full p-2 transition hover:bg-white/8 hover:text-[color:var(--foreground)]"
            style={{ color: "var(--muted-foreground)" }}
            aria-label={t("library.closePlaylistModal")}
          >
            <svg
              xmlns="http://www.w3.org/2000/svg"
              viewBox="0 0 24 24"
              fill="none"
              stroke="currentColor"
              strokeWidth="1.8"
              className="h-5 w-5"
              aria-hidden="true"
            >
              <path strokeLinecap="round" d="m6 6 12 12M18 6 6 18" />
            </svg>
          </button>
        </div>

        <div className="mt-5 space-y-3">
          <label className="block">
            <span
              className="mb-2 block text-sm font-medium"
              style={{ color: "var(--muted-foreground)" }}
            >
              {t("library.importPlaylistUrlLabel")}
            </span>
            <input
              value={url}
              onChange={(event) => onUrlChange(event.target.value)}
              placeholder={t("library.importPlaylistUrlPlaceholder")}
              className="theme-surface-strong w-full rounded-xl border px-4 py-3 text-[color:var(--foreground)] outline-none transition placeholder:text-[color:color-mix(in_srgb,var(--foreground)_35%,transparent)] focus:border-[color:color-mix(in_srgb,var(--foreground)_30%,transparent)]"
            />
          </label>
          <p
            className="text-xs"
            style={{ color: "var(--muted-foreground)" }}
          >
            {t("library.importPlaylistSupportedSources")}
          </p>
          {error ? (
            <p className="text-sm" style={{ color: "#f87171" }}>
              {error}
            </p>
          ) : null}
        </div>

        <div className="mt-5 flex items-center justify-end gap-3">
          <button
            type="button"
            onClick={onClose}
            className="rounded-full px-4 py-2 text-sm font-semibold transition hover:text-[color:var(--foreground)]"
            style={{ color: "var(--muted-foreground)" }}
          >
            {t("common.cancel")}
          </button>
          <button
            type="button"
            onClick={onSubmit}
            disabled={!canSubmit}
            className="rounded-full px-5 py-2.5 text-sm font-semibold transition hover:scale-[1.02] disabled:cursor-not-allowed disabled:opacity-40 disabled:hover:scale-100"
            style={{
              background: "var(--theme-accent)",
              color: "var(--theme-accent-contrast)",
            }}
          >
            {isImporting
              ? t("library.importingPlaylist")
              : t("library.importPlaylist")}
          </button>
        </div>
      </div>
    </div>
  );
}
