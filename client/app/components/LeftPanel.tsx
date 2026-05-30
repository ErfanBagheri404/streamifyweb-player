// components/LeftPanel.tsx
"use client";

import Image from "next/image";
import { usePathname, useRouter } from "next/navigation";
import { useEffect, useState } from "react";
import { useAudio } from "../contexts/AudioContext";

interface SearchState {
  query: string;
  source: string;
  filter: string;
}

export default function LeftPanel() {
  const router = useRouter();
  const pathname = usePathname();
  const { recentSongs, playSong } = useAudio();
  const [lastSearch, setLastSearch] = useState<SearchState | null>(null);

  const openSearch = () => {
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

  const recentCovers = recentSongs.filter((song) => song.coverUrl);
  const isHomePage = pathname === "/";
  const isSearchPage = pathname.startsWith("/search");
  const isLibraryPage = pathname.startsWith("/library");
  const getIconClassName = (isActive: boolean) =>
    [
      "cursor-pointer transition-all duration-200 ease-out",
      isActive ? "opacity-100 scale-100" : "scale-[0.88] opacity-65",
    ].join(" ");

  useEffect(() => {
    // Load last search state from localStorage
    const saved = localStorage.getItem("lastSearch");
    if (saved) {
      setLastSearch(JSON.parse(saved));
    }
  }, []);

  return (
    <div className="flex flex-col gap-3 h-full pr-4">
      {/* First Box */}
      <div className="flex w-[86px] flex-col items-center gap-7 rounded-xl bg-[#181818] px-7 py-6">
        <button
          type="button"
          onClick={() => router.push("/")}
          className="flex items-center justify-center"
          aria-label="Go to home"
        >
          <Image
            src="/StreamifyLogo.svg"
            alt="Streamify Logo"
            width={30}
            height={30}
            className={getIconClassName(isHomePage)}
            priority
          />
        </button>
        <button
          type="button"
          onClick={openSearch}
          className="flex items-center justify-center"
          aria-label="Open search"
        >
          <Image
            src="/Search.svg"
            alt="Search"
            width={30}
            height={30}
            className={getIconClassName(isSearchPage)}
          />
        </button>
        <button
          type="button"
          onClick={() => router.push("/library")}
          className="flex items-center justify-center"
          aria-label="Open library"
        >
          <Image
            src="/Library.svg"
            alt="Library"
            width={30}
            height={30}
            className={getIconClassName(isLibraryPage)}
          />
        </button>
      </div>

      {/* Second Box */}
      <div className="mb-20 flex w-[86px] flex-1 min-h-0 flex-col items-center rounded-xl bg-[#181818] py-6">
        <div className="flex w-full flex-1 flex-col items-center gap-3 overflow-y-auto hide-scrollbar pr-1">
          {recentCovers.length > 0
            ? recentCovers.map((song) => (
                <button
                  key={song.id}
                  type="button"
                  onClick={() => playSong(song)}
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
                  <Image
                    src="/StreamifyLogo.svg"
                    alt="No recent song"
                    width={16}
                    height={16}
                    className="opacity-40"
                  />
                </div>
              ))}
        </div>
      </div>
    </div>
  );
}
