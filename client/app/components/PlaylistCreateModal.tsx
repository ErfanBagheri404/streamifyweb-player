"use client";

import { useEffect } from "react";
import { useAppLanguage } from "../hooks/useAppLanguage";

function FolderGlyph() {
  return (
    <svg
      xmlns="http://www.w3.org/2000/svg"
      viewBox="0 0 24 24"
      fill="none"
      stroke="currentColor"
      strokeWidth="1.8"
      className="h-10 w-10"
      aria-hidden="true"
    >
      <path
        strokeLinecap="round"
        strokeLinejoin="round"
        d="M3.75 7.5A1.75 1.75 0 0 1 5.5 5.75h4.32c.46 0 .9.183 1.225.508l1.197 1.197c.326.325.767.508 1.227.508h4.03a1.75 1.75 0 0 1 1.75 1.75v7.787a1.75 1.75 0 0 1-1.75 1.75H5.5a1.75 1.75 0 0 1-1.75-1.75V7.5Z"
      />
    </svg>
  );
}

export default function PlaylistCreateModal({
  open,
  name,
  description,
  onNameChange,
  onDescriptionChange,
  onClose,
  onSubmit,
}: {
  open: boolean;
  name: string;
  description: string;
  onNameChange: (value: string) => void;
  onDescriptionChange: (value: string) => void;
  onClose: () => void;
  onSubmit: () => void;
}) {
  const { t } = useAppLanguage();
  const canSubmit = name.trim().length > 0;
  const previewName = name.trim() || t("library.myPlaylist");
  const previewDescription =
    description.trim() || t("library.playlistDescriptionPlaceholder");

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
      className={`fixed inset-0 z-[70] flex items-center justify-center px-4 transition-all duration-200 ${
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
        className={`theme-surface w-full max-w-2xl rounded-3xl border p-6 text-[color:var(--foreground)] shadow-[0_24px_64px_rgba(0,0,0,0.45)] transition-all duration-200 md:p-7 ${
          open ? "translate-y-0 scale-100" : "translate-y-3 scale-[0.97]"
        }`}
        onClick={(event) => event.stopPropagation()}
      >
        <div className="flex items-start justify-between gap-4">
          <div>
            <h2 className="text-2xl font-bold text-[color:var(--foreground)]">
              {t("library.createPlaylistModalTitle")}
            </h2>
            <p
              className="mt-1 text-sm"
              style={{ color: "var(--muted-foreground)" }}
            >
              {t("library.createPlaylistModalDescription")}
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

        <div className="mt-6 grid gap-6 md:grid-cols-[220px_minmax(0,1fr)]">
          <div className="theme-surface-strong rounded-2xl border p-4">
            <div
              className="mx-auto flex aspect-square w-full max-w-[220px] items-center justify-center rounded-2xl shadow-[0_20px_45px_rgba(0,0,0,0.3)]"
              style={{
                background:
                  "linear-gradient(135deg, var(--theme-accent) 0%, var(--collection-hero-start) 55%, var(--collection-hero-mid) 100%)",
                color: "var(--theme-accent-contrast)",
              }}
            >
              <FolderGlyph />
            </div>
            <div className="mt-4 px-1">
              <p className="truncate text-lg font-semibold text-[color:var(--foreground)]">
                {previewName}
              </p>
              <p
                className="mt-2 line-clamp-3 text-sm"
                style={{ color: "var(--muted-foreground)" }}
              >
                {previewDescription}
              </p>
            </div>
          </div>

          <div className="space-y-4">
            <label className="block">
              <span
                className="mb-2 block text-sm font-medium"
                style={{ color: "var(--muted-foreground)" }}
              >
                {t("library.name")}
              </span>
              <input
                value={name}
                onChange={(event) => onNameChange(event.target.value)}
                placeholder={t("library.myPlaylist")}
                className="theme-surface-strong w-full rounded-xl border px-4 py-3 text-[color:var(--foreground)] outline-none transition placeholder:text-[color:color-mix(in_srgb,var(--foreground)_35%,transparent)] focus:border-[color:color-mix(in_srgb,var(--foreground)_30%,transparent)]"
              />
            </label>

            <label className="block">
              <span
                className="mb-2 block text-sm font-medium"
                style={{ color: "var(--muted-foreground)" }}
              >
                {t("library.description")}
              </span>
              <textarea
                value={description}
                onChange={(event) => onDescriptionChange(event.target.value)}
                placeholder={t("library.whatIsPlaylistFor")}
                rows={7}
                className="theme-surface-strong w-full resize-none rounded-xl border px-4 py-3 text-[color:var(--foreground)] outline-none transition placeholder:text-[color:color-mix(in_srgb,var(--foreground)_35%,transparent)] focus:border-[color:color-mix(in_srgb,var(--foreground)_30%,transparent)]"
              />
            </label>
          </div>
        </div>

        <div className="mt-6 flex items-center justify-end gap-3">
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
            {t("common.create")}
          </button>
        </div>
      </div>
    </div>
  );
}
