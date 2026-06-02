// components/LeftPanel.tsx
"use client";

import Image from "next/image";
import { usePathname, useRouter } from "next/navigation";
import { useEffect, useState } from "react";
import { useAudio } from "../contexts/AudioContext";
import { LibraryIcon, LogoIcon, SearchIcon } from "./icons/NavIcons";

interface SearchState {
  query: string;
  source: string;
  filter: string;
}

export default function LeftPanel() {
  const router = useRouter();
  const pathname = usePathname();
  const { recentSongs, resolveAndPlaySong, closeFullscreen, isPlayerVisible } =
    useAudio();
  const [lastSearch] = useState<SearchState | null>(() => {
    try {
      const saved = localStorage.getItem("lastSearch");
      return saved ? (JSON.parse(saved) as SearchState) : null;
    } catch {
      return null;
    }
  });
  const navIconStrokeWidth = 0.45;

  useEffect(() => {
    router.prefetch("/");
    router.prefetch("/library");

    if (lastSearch?.query) {
      const params = new URLSearchParams();
      params.set("q", lastSearch.query);
      if (lastSearch.source !== "youtube")
        params.set("source", lastSearch.source);
      if (lastSearch.filter !== "all") params.set("filter", lastSearch.filter);
      router.prefetch(`/search?${params.toString()}`);
      return;
    }

    router.prefetch("/search");
  }, [lastSearch, router]);

  const openSearch = () => {
    closeFullscreen();

    if (lastSearch?.query) {
      const params = new URLSearchParams();
      params.set("q", lastSearch.query);
      if (lastSearch.source !== "youtube")
        params.set("source", lastSearch.source);
      if (lastSearch.filter !== "all") params.set("filter", lastSearch.filter);
      router.push(`/search?${params.toString()}`);
      return;
    }

    router.push("/search");
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
  const isHomePage = pathname === "/";
  const isSearchPage = pathname.startsWith("/search");
  const isLibraryPage = pathname.startsWith("/library");
  const getIconClassName = (isActive: boolean) =>
    [
      "h-[30px] w-[30px] cursor-pointer transition-all duration-200 ease-out text-white",
      isActive ? "opacity-100 scale-100" : "scale-[0.88] opacity-65",
    ].join(" ");

  return (
    <div className="flex flex-col gap-3 h-full pr-4">
      {/* First Box */}
      <div className="flex w-[86px] flex-col items-center gap-7 rounded-xl bg-[#181818] px-7 py-6">
        <button
          type="button"
          onClick={() => {
            closeFullscreen();
            router.push("/");
          }}
          className="flex items-center justify-center"
          aria-label="Go to home"
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
          aria-label="Open search"
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
          aria-label="Open library"
        >
          <LibraryIcon
            className={getIconClassName(isLibraryPage)}
            strokeWidth={navIconStrokeWidth}
          />
        </button>
      </div>

      {/* Second Box */}
      <div
        className={[
          "flex w-[86px] flex-1 min-h-0 flex-col items-center rounded-xl bg-[#181818] py-6",
          isPlayerVisible ? "mb-20" : "",
        ].join(" ")}
      >
        <div className="flex w-full flex-1 flex-col items-center gap-3 overflow-y-auto hide-scrollbar pr-1">
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
                  className="flex h-[30px] w-[30px] shrink-0 items-center justify-center rounded-md bg-neutral-800"
                >
                  <LogoIcon className="h-4 w-4 opacity-40 text-white" />
                </div>
              ))}
        </div>
      </div>
    </div>
  );
}
