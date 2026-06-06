// components/LeftPanel.tsx
"use client";

import Image from "next/image";
import { usePathname, useRouter } from "next/navigation";
import { useEffect, useState } from "react";
import { useAudio } from "../contexts/AudioContext";
import { useSettings } from "../contexts/SettingsContext";
import { useAppLanguage } from "../hooks/useAppLanguage";
import { createStoredPlaylist } from "../lib/local-library";
import PlaylistCreateModal from "./PlaylistCreateModal";
import { LibraryIcon, LogoIcon, SearchIcon } from "./icons/NavIcons";

interface SearchState {
  query: string;
  source: string;
  filter: string;
}

function PlusGlyph() {
  return (
    <svg
      xmlns="http://www.w3.org/2000/svg"
      viewBox="0 0 24 24"
      fill="none"
      stroke="currentColor"
      strokeWidth="1.8"
      className="h-6 w-6"
      aria-hidden="true"
    >
      <path strokeLinecap="round" d="M12 5v14M5 12h14" />
    </svg>
  );
}

const SEARCH_STATE_UPDATED_EVENT = "streamify-search-state-updated";

function readLastSearchState(): SearchState | null {
  try {
    const saved = localStorage.getItem("lastSearch");
    return saved ? (JSON.parse(saved) as SearchState) : null;
  } catch {
    return null;
  }
}

export default function LeftPanel() {
  const router = useRouter();
  const pathname = usePathname();
  const { settings } = useSettings();
  const { t } = useAppLanguage();
  const { recentSongs, resolveAndPlaySong, closeFullscreen, isPlayerVisible } =
    useAudio();
  const [lastSearch, setLastSearch] = useState<SearchState | null>(
    readLastSearchState
  );
  const [isCreateModalOpen, setIsCreateModalOpen] = useState(false);
  const [playlistName, setPlaylistName] = useState("");
  const [playlistDescription, setPlaylistDescription] = useState("");
  const navIconStrokeWidth = 0.45;
  const effectiveLastSearch = settings.rememberLastSearch ? lastSearch : null;

  useEffect(() => {
    const syncLastSearch = () => {
      setLastSearch(readLastSearchState());
    };

    syncLastSearch();
    window.addEventListener("storage", syncLastSearch);
    window.addEventListener(SEARCH_STATE_UPDATED_EVENT, syncLastSearch);

    return () => {
      window.removeEventListener("storage", syncLastSearch);
      window.removeEventListener(SEARCH_STATE_UPDATED_EVENT, syncLastSearch);
    };
  }, []);

  useEffect(() => {
    router.prefetch("/");
    router.prefetch("/library");
    router.prefetch("/settings");

    if (effectiveLastSearch?.query) {
      const params = new URLSearchParams();
      params.set("q", effectiveLastSearch.query);
      if (effectiveLastSearch.source !== "youtube")
        params.set("source", effectiveLastSearch.source);
      if (effectiveLastSearch.filter !== "all")
        params.set("filter", effectiveLastSearch.filter);
      router.prefetch(`/search?${params.toString()}`);
      return;
    }

    router.prefetch(
      settings.preferredSearchSource === "youtube"
        ? "/search"
        : `/search?source=${settings.preferredSearchSource}`
    );
  }, [effectiveLastSearch, router, settings.preferredSearchSource]);

  const openSearch = () => {
    closeFullscreen();

    if (effectiveLastSearch?.query) {
      const params = new URLSearchParams();
      params.set("q", effectiveLastSearch.query);
      if (effectiveLastSearch.source !== "youtube")
        params.set("source", effectiveLastSearch.source);
      if (effectiveLastSearch.filter !== "all")
        params.set("filter", effectiveLastSearch.filter);
      router.push(`/search?${params.toString()}`);
      return;
    }

    router.push(
      settings.preferredSearchSource === "youtube"
        ? "/search"
        : `/search?source=${settings.preferredSearchSource}`
    );
  };

  const recentCovers = (() => {
    const seen = new Set<string>();
    const out: typeof recentSongs = [];
    for (const song of recentSongs) {
      if (!song?.coverUrl || seen.has(song.id)) continue;
      seen.add(song.id);
      out.push(song);
    }
    return out;
  })();
  const openCreatePlaylist = () => {
    closeFullscreen();
    setPlaylistName("");
    setPlaylistDescription("");
    setIsCreateModalOpen(true);
  };
  const closeCreatePlaylist = () => {
    setIsCreateModalOpen(false);
    setPlaylistName("");
    setPlaylistDescription("");
  };
  const submitCreatePlaylist = () => {
    const name = playlistName.trim();
    if (!name) return;

    createStoredPlaylist(name, playlistDescription.trim());
    closeCreatePlaylist();
  };
  const isHomePage = pathname === "/";
  const isSearchPage = pathname.startsWith("/search");
  const isLibraryPage = pathname.startsWith("/library");
  const isSettingsPage = pathname.startsWith("/settings");
  const getIconClassName = (isActive: boolean) =>
    [
      "h-[30px] w-[30px] cursor-pointer transition-all duration-200 ease-out text-white",
      isActive ? "opacity-100 scale-100" : "scale-[0.88] opacity-65",
    ].join(" ");
  const getAssetIconClassName = (isActive: boolean) =>
    [
      "h-[30px] w-[30px] select-none cursor-pointer transition-all duration-200 ease-out",
      isActive ? "opacity-100 scale-100" : "scale-[0.88] opacity-65",
    ].join(" ");

  return (
    <div
      className="flex h-full flex-col gap-3"
      style={{ paddingInlineEnd: "1rem" }}
    >
      {/* First Box */}
      <div className="theme-surface flex w-[86px] flex-col items-center gap-7 rounded-xl border px-7 py-6">
        <button
          type="button"
          onClick={() => {
            closeFullscreen();
            router.push("/");
          }}
          className="flex items-center justify-center"
          aria-label={t("leftPanel.goHome")}
        >
          <LogoIcon
            className={getIconClassName(isHomePage)}
            strokeWidth={navIconStrokeWidth}
          />
        </button>
        <button
          type="button"
          onClick={openSearch}
          className="flex items-center justify-center"
          aria-label={t("leftPanel.openSearch")}
        >
          <SearchIcon
            className={getIconClassName(isSearchPage)}
            strokeWidth={navIconStrokeWidth}
          />
        </button>
        <button
          type="button"
          onClick={() => {
            closeFullscreen();
            router.push("/library");
          }}
          className="flex items-center justify-center"
          aria-label={t("leftPanel.openLibrary")}
        >
          <LibraryIcon
            className={getIconClassName(isLibraryPage)}
            strokeWidth={navIconStrokeWidth}
          />
        </button>
        <button
          type="button"
          onClick={() => {
            closeFullscreen();
            router.push("/settings");
          }}
          className="flex cursor-pointer items-center justify-center"
          aria-label={t("leftPanel.openSettings")}
        >
          <Image
            src="/Settings.svg"
            alt=""
            width={30}
            height={30}
            className={getAssetIconClassName(isSettingsPage)}
            aria-hidden="true"
            unoptimized
          />
        </button>
      </div>

      {/* Second Box */}
      <div
        className={[
          "theme-surface relative flex w-[86px] min-h-0 flex-1 flex-col items-center overflow-hidden rounded-xl border py-6",
          isPlayerVisible ? "mb-20" : "",
        ].join(" ")}
      >
        <div
          className="flex w-full flex-1 flex-col items-center gap-3 overflow-y-auto hide-scrollbar px-1 pb-6"
          style={{ paddingInlineEnd: "0.25rem" }}
        >
          {recentCovers.length > 0
            ? recentCovers.map((song, index) => (
                <button
                  key={`recent-${song.id}-${index}`}
                  type="button"
                  onClick={() => {
                    void resolveAndPlaySong(song).catch((error) => {
                      console.error("Failed to replay recent song:", error);
                    });
                  }}
                  className="h-[40px] w-[40px] shrink-0 overflow-hidden rounded-sm"
                  title={song.title}
                >
                  <Image
                    src={song.coverUrl!}
                    alt={song.title}
                    width={40}
                    height={40}
                    className="h-[40px] w-[40px] object-cover"
                    unoptimized
                  />
                </button>
              ))
            : [...Array(3)].map((_, index) => (
                <div
                  key={index}
                  className="theme-surface-soft flex h-[30px] w-[30px] shrink-0 items-center justify-center rounded-md border"
                >
                  <LogoIcon className="h-4 w-4 opacity-40 text-white" />
                </div>
              ))}
        </div>
        <button
          type="button"
          onClick={() => {
            openCreatePlaylist();
          }}
          className="theme-button-accent absolute bottom-4 left-1/2 z-10 flex h-12 w-12 -translate-x-1/2 items-center justify-center rounded-full border border-white/10 shadow-[0_12px_30px_rgba(0,0,0,0.32)] transition hover:scale-[1.04]"
          aria-label={t("library.createPlaylistAria")}
          title={t("library.createPlaylist")}
        >
          <PlusGlyph />
        </button>
      </div>
      <PlaylistCreateModal
        open={isCreateModalOpen}
        name={playlistName}
        description={playlistDescription}
        onNameChange={setPlaylistName}
        onDescriptionChange={setPlaylistDescription}
        onClose={closeCreatePlaylist}
        onSubmit={submitCreatePlaylist}
      />
    </div>
  );
}
