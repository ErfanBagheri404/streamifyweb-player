"use client";

import type { User } from "@supabase/supabase-js";
import React, {
  useCallback,
  useEffect,
  useMemo,
  useRef,
  useState,
} from "react";
import Image from "next/image";
import Link from "next/link";
import { useRouter, useSearchParams } from "next/navigation";
import { type Song, useAudio } from "../contexts/AudioContext";
import { useToast } from "../contexts/ToastContext";
import { useAppLanguage } from "../hooks/useAppLanguage";
import PlaylistCreateModal from "../components/PlaylistCreateModal";
import {
  createStoredPlaylist,
  getLocalCollectionPath,
  LOCAL_LIBRARY_UPDATED_EVENT,
  readLikedSongs,
  refreshLocalLibrarySongMetadata,
  readStoredPlaylists,
  type StoredPlaylist,
} from "../lib/local-library";
import {
  buildArtistRouteHref,
  canOpenArtistRoute,
} from "../lib/artist-routing";
import {
  buildCurrentLocalLibrarySyncSource,
  pushCloudLibrarySnapshot,
} from "../lib/cloud-library-sync";
import { getSupabaseBrowserClient } from "../lib/supabase/browser";

type FilterChip =
  | "Playlists"
  | "Podcasts & Shows"
  | "Albums"
  | "Artists"
  | "Downloaded";

type SortMode = "recents" | "alphabetical" | "creator";
type LibraryViewMode = "grid" | "list";

interface ArtistSummary {
  name: string;
  count: number;
  image?: string;
  artistId?: string;
  source?: string;
  href?: string | null;
}

type LibraryGridItem =
  | {
      kind: "artist";
      id: string;
      artist: ArtistSummary;
      priority?: boolean;
    }
  | {
      kind: "media";
      id: string;
      title: string;
      subtitle: string;
      meta: string;
      searchText?: string;
      artwork: React.ReactNode;
      onOpen?: () => void;
      onPlay?: () => void;
      priority?: boolean;
    };

const FILTER_CHIPS: FilterChip[] = [
  "Playlists",
  "Podcasts & Shows",
  "Albums",
  "Artists",
  "Downloaded",
];

function formatSongCount(
  count: number,
  singular: string,
  plural = `${singular}s`
) {
  return `${count} ${count === 1 ? singular : plural}`;
}

function getInitials(text: string): string {
  return text
    .split(/\s+/)
    .filter(Boolean)
    .slice(0, 2)
    .map((part) => part[0]?.toUpperCase() ?? "")
    .join("");
}

function formatTrackDuration(seconds?: number): string {
  if (!seconds || Number.isNaN(seconds)) return "Recently played";
  const mins = Math.floor(seconds / 60);
  const secs = Math.floor(seconds % 60);
  return `${mins}:${String(secs).padStart(2, "0")}`;
}

function buildSongSearchText(songs: Song[]): string {
  return songs
    .flatMap((song) => [song.title, song.artist])
    .filter(Boolean)
    .join(" ");
}

function interleaveItems<T>(left: T[], right: T[]): T[] {
  const output: T[] = [];
  const maxLength = Math.max(left.length, right.length);

  for (let index = 0; index < maxLength; index += 1) {
    if (left[index]) output.push(left[index]);
    if (right[index]) output.push(right[index]);
  }

  return output;
}

function PlusGlyph() {
  return (
    <svg
      xmlns="http://www.w3.org/2000/svg"
      viewBox="0 0 24 24"
      fill="none"
      stroke="currentColor"
      strokeWidth="1.8"
      className="h-4 w-4"
      aria-hidden="true"
    >
      <path strokeLinecap="round" d="M12 5v14M5 12h14" />
    </svg>
  );
}

function SearchGlyph() {
  return (
    <svg
      xmlns="http://www.w3.org/2000/svg"
      viewBox="0 0 20 20"
      fill="currentColor"
      className="h-4 w-4"
      aria-hidden="true"
    >
      <path
        fillRule="evenodd"
        d="M9 3.5a5.5 5.5 0 1 0 3.473 9.766l2.63 2.63a.75.75 0 1 0 1.06-1.06l-2.629-2.63A5.5 5.5 0 0 0 9 3.5ZM5 9a4 4 0 1 1 8 0 4 4 0 0 1-8 0Z"
        clipRule="evenodd"
      />
    </svg>
  );
}

function SyncGlyph({ className = "h-4 w-4" }: { className?: string }) {
  return (
    <svg
      xmlns="http://www.w3.org/2000/svg"
      viewBox="0 0 24 24"
      fill="none"
      stroke="currentColor"
      strokeWidth="1.8"
      className={className}
      aria-hidden="true"
    >
      <path
        strokeLinecap="round"
        strokeLinejoin="round"
        d="M16.5 8.25h3.75V4.5M7.5 15.75H3.75v3.75"
      />
      <path
        strokeLinecap="round"
        strokeLinejoin="round"
        d="M19.5 8.25a7.5 7.5 0 0 0-12.78-2.03L3.75 9.25M4.5 15.75a7.5 7.5 0 0 0 12.78 2.03l2.97-3.03"
      />
    </svg>
  );
}

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

function HeartGlyph() {
  return (
    <svg
      xmlns="http://www.w3.org/2000/svg"
      viewBox="0 0 24 24"
      fill="currentColor"
      className="h-10 w-10"
      aria-hidden="true"
    >
      <path d="M12 21.35 10.55 20C5.4 15.24 2 12.09 2 8.22 2 5.07 4.42 2.65 7.57 2.65c1.78 0 3.49.82 4.43 2.12.94-1.3 2.65-2.12 4.43-2.12C19.58 2.65 22 5.07 22 8.22c0 3.87-3.4 7.02-8.55 11.78L12 21.35Z" />
    </svg>
  );
}

function ClockGlyph() {
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
      <circle cx="12" cy="12" r="8.25" />
      <path
        strokeLinecap="round"
        strokeLinejoin="round"
        d="M12 7.75v4.75l3.25 1.75"
      />
    </svg>
  );
}

function PlayGlyph() {
  return (
    <svg
      xmlns="http://www.w3.org/2000/svg"
      viewBox="0 0 24 24"
      fill="currentColor"
      className="h-4 w-4"
      aria-hidden="true"
    >
      <path d="M8.75 6.6c0-1.01 1.11-1.63 1.98-1.1l7.61 4.65a1.3 1.3 0 0 1 0 2.2l-7.61 4.65c-.87.53-1.98-.09-1.98-1.1V6.6Z" />
    </svg>
  );
}

function GridGlyph() {
  return (
    <svg
      xmlns="http://www.w3.org/2000/svg"
      viewBox="0 0 24 24"
      fill="currentColor"
      className="h-4 w-4"
      aria-hidden="true"
    >
      <path d="M4 4h7v7H4V4Zm9 0h7v7h-7V4ZM4 13h7v7H4v-7Zm9 0h7v7h-7v-7Z" />
    </svg>
  );
}

function ListGlyph() {
  return (
    <svg
      xmlns="http://www.w3.org/2000/svg"
      viewBox="0 0 24 24"
      fill="none"
      stroke="currentColor"
      strokeWidth="1.8"
      className="h-4 w-4"
      aria-hidden="true"
    >
      <path strokeLinecap="round" d="M8 7h11M8 12h11M8 17h11" />
      <circle cx="4.25" cy="7" r="1.25" fill="currentColor" stroke="none" />
      <circle cx="4.25" cy="12" r="1.25" fill="currentColor" stroke="none" />
      <circle cx="4.25" cy="17" r="1.25" fill="currentColor" stroke="none" />
    </svg>
  );
}

function ChevronDownGlyph({ className = "h-4 w-4" }: { className?: string }) {
  return (
    <svg
      xmlns="http://www.w3.org/2000/svg"
      viewBox="0 0 24 24"
      fill="none"
      stroke="currentColor"
      strokeWidth="1.8"
      className={className}
      aria-hidden="true"
    >
      <path strokeLinecap="round" strokeLinejoin="round" d="m6 9 6 6 6-6" />
    </svg>
  );
}

function SmartPlaylistArtwork({
  variant,
  songs,
  label,
  priority = false,
}: {
  variant: "liked" | "history" | "playlist";
  songs: Song[];
  label: string;
  priority?: boolean;
}) {
  if (variant === "liked") {
    return (
      <div
        className="flex aspect-square w-full items-center justify-center rounded-xl text-white shadow-[0_18px_40px_rgba(95,75,255,0.35)]"
        style={{
          background:
            "linear-gradient(135deg, color-mix(in srgb, var(--theme-accent) 86%, white 14%) 0%, color-mix(in srgb, var(--theme-accent) 62%, #7c3aed 38%) 48%, color-mix(in srgb, var(--surface-2) 80%, black 20%) 100%)",
        }}
      >
        <HeartGlyph />
      </div>
    );
  }

  if (variant === "history") {
    return (
      <div className="flex aspect-square w-full items-center justify-center rounded-xl bg-gradient-to-br from-[#245d8f] via-[#1a4b70] to-[#121212] text-white shadow-[0_18px_40px_rgba(20,70,120,0.32)]">
        <ClockGlyph />
      </div>
    );
  }

  const covers = (() => {
    const seen = new Set<string>();
    const out: typeof songs = [];
    for (const song of songs) {
      if (!song?.coverUrl || seen.has(song.id)) continue;
      seen.add(song.id);
      out.push(song);
      if (out.length >= 4) break;
    }
    return out;
  })();

  if (covers.length === 1) {
    return (
      <div className="theme-surface-soft relative aspect-square w-full overflow-hidden rounded-xl">
        <Image
          src={covers[0].coverUrl!}
          alt={label}
          fill
          sizes="(max-width: 768px) 40vw, 180px"
          className="object-cover"
          priority={priority}
          unoptimized
        />
      </div>
    );
  }

  if (covers.length === 2) {
    return (
      <div className="theme-surface-soft grid aspect-square w-full grid-cols-2 overflow-hidden rounded-xl">
        {covers.map((song, index) => (
          <div
            key={`playlist-cover-${song.id}-${index}`}
            className="relative h-full w-full"
          >
            <Image
              src={song.coverUrl!}
              alt={`${label} cover ${index + 1}`}
              fill
              sizes="(max-width: 768px) 20vw, 90px"
              className="object-cover"
              priority={priority}
              unoptimized
            />
          </div>
        ))}
      </div>
    );
  }

  if (covers.length === 3) {
    return (
      <div className="theme-surface-soft grid aspect-square w-full grid-cols-2 grid-rows-2 overflow-hidden rounded-xl">
        <div className="relative row-span-2 h-full w-full">
          <Image
            src={covers[0].coverUrl!}
            alt={`${label} cover 1`}
            fill
            sizes="(max-width: 768px) 20vw, 90px"
            className="object-cover"
            priority={priority}
            unoptimized
          />
        </div>
        <div className="relative h-full w-full">
          <Image
            src={covers[1].coverUrl!}
            alt={`${label} cover 2`}
            fill
            sizes="(max-width: 768px) 20vw, 90px"
            className="object-cover"
            priority={priority}
            unoptimized
          />
        </div>
        <div className="relative h-full w-full">
          <Image
            src={covers[2].coverUrl!}
            alt={`${label} cover 3`}
            fill
            sizes="(max-width: 768px) 20vw, 90px"
            className="object-cover"
            priority={priority}
            unoptimized
          />
        </div>
      </div>
    );
  }

  if (covers.length >= 4) {
    return (
      <div className="theme-surface-soft grid aspect-square w-full grid-cols-2 grid-rows-2 overflow-hidden rounded-xl">
        {covers.slice(0, 4).map((song, index) => (
          <div
            key={`playlist-cover-${song.id}-${index}`}
            className="relative h-full w-full"
          >
            <Image
              src={song.coverUrl!}
              alt={`${label} cover ${index + 1}`}
              fill
              sizes="(max-width: 768px) 20vw, 90px"
              className="object-cover"
              priority={priority}
              unoptimized
            />
          </div>
        ))}
      </div>
    );
  }

  return (
    <div className="theme-surface flex aspect-square w-full items-center justify-center rounded-xl theme-muted">
      <FolderGlyph />
    </div>
  );
}

function PlaylistCard({
  title,
  subtitle,
  meta,
  artwork,
  onOpen,
  onPlay,
}: {
  title: string;
  subtitle: string;
  meta: string;
  artwork: React.ReactNode;
  onOpen?: () => void;
  onPlay?: () => void;
}) {
  const isOpenable = Boolean(onOpen);

  return (
    <div
      className={`group text-left ${isOpenable ? "cursor-pointer" : ""}`}
      onClick={onOpen}
      onKeyDown={
        isOpenable
          ? (event) => {
              if (event.key === "Enter" || event.key === " ") {
                event.preventDefault();
                onOpen?.();
              }
            }
          : undefined
      }
      role={isOpenable ? "button" : undefined}
      tabIndex={isOpenable ? 0 : undefined}
    >
      <div className="theme-surface relative overflow-hidden rounded-xl transition duration-200 group-hover:bg-[color:color-mix(in_srgb,var(--surface-2)_82%,var(--foreground)_6%)]">
        {artwork}
        {onPlay ? (
          <button
            type="button"
            onClick={(event) => {
              event.stopPropagation();
              void onPlay();
            }}
            className="theme-button-accent absolute bottom-3 right-3 flex h-12 w-12 translate-y-2 items-center justify-center rounded-full opacity-0 shadow-[0_12px_24px_rgba(0,0,0,0.35)] transition-all duration-200 group-hover:translate-y-0 group-hover:opacity-100"
            aria-label={title}
          >
            <PlayGlyph />
          </button>
        ) : null}
      </div>
      <div className="px-1 pt-3">
        <p className="truncate text-[15px] font-semibold text-[color:var(--foreground)]">
          {title}
        </p>
        <p className="theme-muted mt-1 truncate text-sm">{subtitle}</p>
        <p className="mt-1 truncate text-xs text-[color:color-mix(in_srgb,var(--foreground)_38%,transparent)]">
          {meta}
        </p>
      </div>
    </div>
  );
}

function ArtistCard({
  artist,
  priority = false,
}: {
  artist: ArtistSummary;
  priority?: boolean;
}) {
  const { t } = useAppLanguage();
  const content = (
    <>
      <div className="theme-surface relative aspect-square overflow-hidden rounded-full transition duration-200 group-hover:bg-[color:color-mix(in_srgb,var(--surface-2)_82%,var(--foreground)_6%)]">
        {artist.image ? (
          <Image
            src={artist.image}
            alt={artist.name}
            fill
            sizes="(max-width: 768px) 40vw, 180px"
            className="object-cover"
            priority={priority}
            unoptimized
          />
        ) : (
          <div className="theme-surface-soft flex h-full w-full items-center justify-center text-2xl font-semibold text-[color:color-mix(in_srgb,var(--foreground)_80%,transparent)]">
            {getInitials(artist.name)}
          </div>
        )}
      </div>
      <div className="px-1 pt-3">
        <p className="truncate text-[15px] font-semibold text-[color:var(--foreground)]">
          {artist.name}
        </p>
        <p className="theme-muted mt-1 text-sm">{t("library.artist")}</p>
      </div>
    </>
  );

  if (!artist.href) {
    return <div className="group text-left">{content}</div>;
  }

  return (
    <Link href={artist.href} className="group block text-left">
      {content}
    </Link>
  );
}

function LibraryListRow({ item }: { item: LibraryGridItem }) {
  const { t } = useAppLanguage();
  const isArtist = item.kind === "artist";
  const artistHref = isArtist ? item.artist.href : null;
  const onOpen = !isArtist ? item.onOpen : undefined;

  const content = (
    <>
      <div
        className={`theme-surface relative h-14 w-14 shrink-0 overflow-hidden ${
          isArtist ? "rounded-full" : "rounded-xl"
        }`}
      >
        {isArtist ? (
          item.artist.image ? (
            <Image
              src={item.artist.image}
              alt={item.artist.name}
              fill
              sizes="56px"
              className="object-cover"
              priority={item.priority}
              unoptimized
            />
          ) : (
            <div className="theme-surface-soft flex h-full w-full items-center justify-center text-sm font-semibold text-[color:color-mix(in_srgb,var(--foreground)_80%,transparent)]">
              {getInitials(item.artist.name)}
            </div>
          )
        ) : (
          item.artwork
        )}
      </div>

      <div className="min-w-0 flex-1">
        <p className="truncate text-sm font-semibold text-[color:var(--foreground)]">
          {isArtist ? item.artist.name : item.title}
        </p>
        <p className="theme-muted mt-1 truncate text-sm">
          {isArtist ? t("library.artist") : item.subtitle}
        </p>
      </div>

      <div className="shrink-0 text-right">
        <p className="text-xs text-[color:color-mix(in_srgb,var(--foreground)_40%,transparent)]">
          {isArtist
            ? formatSongCount(item.artist.count, "play")
            : item.meta || t("library.open")}
        </p>
        {!isArtist && item.onOpen ? (
          <p className="mt-1 text-xs font-medium text-[color:color-mix(in_srgb,var(--foreground)_60%,transparent)] transition group-hover:text-[color:var(--foreground)]">
            {t("library.open")}
          </p>
        ) : null}
      </div>
    </>
  );

  if (artistHref) {
    return (
      <Link
        href={artistHref}
        className="group flex w-full items-center gap-4 rounded-2xl px-3 py-3 text-left transition hover:bg-[color:color-mix(in_srgb,var(--surface-3)_78%,var(--foreground)_5%)]"
      >
        {content}
      </Link>
    );
  }

  if (onOpen) {
    return (
      <button
        type="button"
        onClick={onOpen}
        className="group flex w-full items-center gap-4 rounded-2xl px-3 py-3 text-left transition hover:bg-[color:color-mix(in_srgb,var(--surface-3)_78%,var(--foreground)_5%)]"
      >
        {content}
      </button>
    );
  }

  return (
    <div className="group flex w-full items-center gap-4 rounded-2xl px-3 py-3 text-left transition hover:bg-[color:color-mix(in_srgb,var(--surface-3)_78%,var(--foreground)_5%)]">
      {content}
    </div>
  );
}

export default function LibraryPage() {
  const router = useRouter();
  const searchParams = useSearchParams();
  const { recentSongs, playSong, resolveAndPlaySong } = useAudio();
  const { t, isRtl } = useAppLanguage();
  const supabase = useMemo(() => getSupabaseBrowserClient(), []);
  const [selectedChip, setSelectedChip] = useState<FilterChip | null>(null);
  const [userPlaylists, setUserPlaylists] =
    useState<StoredPlaylist[]>(readStoredPlaylists);
  const [likedSongs, setLikedSongs] = useState<Song[]>(readLikedSongs);
  const [authUser, setAuthUser] = useState<User | null>(null);
  const [isModalOpen, setIsModalOpen] = useState(false);
  const [playlistName, setPlaylistName] = useState("");
  const [playlistDescription, setPlaylistDescription] = useState("");
  const [libraryQuery, setLibraryQuery] = useState("");
  const [sortMode, setSortMode] = useState<SortMode>("recents");
  const [isSortMenuOpen, setIsSortMenuOpen] = useState(false);
  const [viewMode, setViewMode] = useState<LibraryViewMode>("grid");
  const sortMenuRef = useRef<HTMLDivElement | null>(null);
  const [isSyncing, setIsSyncing] = useState(false);
  const { showNavigationToast, showToast } = useToast();

  useEffect(() => {
    if (typeof window === "undefined") return;

    const syncLocalLibrary = () => {
      setUserPlaylists(readStoredPlaylists());
      setLikedSongs(readLikedSongs());
    };

    syncLocalLibrary();
    window.addEventListener("storage", syncLocalLibrary);
    window.addEventListener(LOCAL_LIBRARY_UPDATED_EVENT, syncLocalLibrary);

    return () => {
      window.removeEventListener("storage", syncLocalLibrary);
      window.removeEventListener(LOCAL_LIBRARY_UPDATED_EVENT, syncLocalLibrary);
    };
  }, []);

  useEffect(() => {
    let isMounted = true;

    if (!supabase) {
      setAuthUser(null);
      return;
    }

    const loadUser = async () => {
      const {
        data: { user },
      } = await supabase.auth.getUser();

      if (!isMounted) return;
      setAuthUser(user);
    };

    void loadUser();

    const {
      data: { subscription },
    } = supabase.auth.onAuthStateChange((_event, session) => {
      if (!isMounted) return;
      setAuthUser(session?.user ?? null);
    });

    return () => {
      isMounted = false;
      subscription.unsubscribe();
    };
  }, [supabase]);

  useEffect(() => {
    if (!isSortMenuOpen) return;

    const handlePointerDown = (event: MouseEvent) => {
      if (!sortMenuRef.current?.contains(event.target as Node)) {
        setIsSortMenuOpen(false);
      }
    };

    window.addEventListener("mousedown", handlePointerDown);
    return () => {
      window.removeEventListener("mousedown", handlePointerDown);
    };
  }, [isSortMenuOpen]);

  const topArtists = useMemo<ArtistSummary[]>(() => {
    const map = new Map<string, ArtistSummary>();

    for (const song of recentSongs) {
      const key = song.artist?.trim() || "Unknown Artist";
      const existing = map.get(key);
      const nextArtistId = song.artistId?.trim();
      const nextSource = song.artistSource || song.source;
      map.set(key, {
        name: key,
        count: (existing?.count ?? 0) + 1,
        image: existing?.image || song.coverUrl,
        artistId: existing?.artistId || nextArtistId,
        source: existing?.source || nextSource,
        href:
          existing?.href ||
          buildArtistRouteHref({
            artistId: existing?.artistId || nextArtistId,
            source: existing?.source || nextSource,
          }),
      });
    }

    return [...map.values()]
      .filter((artist) =>
        canOpenArtistRoute({
          artistId: artist.artistId,
          source: artist.source,
        })
      )
      .sort((a, b) => b.count - a.count)
      .slice(0, 12);
  }, [recentSongs]);

  const shownArtists = useMemo(() => topArtists, [topArtists]);

  const previouslyPlayed = useMemo(
    () => recentSongs.slice(0, 20),
    [recentSongs]
  );

  const playLocalCollection = useCallback(
    async (collectionId: string) => {
      const queue =
        collectionId === "liked-songs"
          ? likedSongs.map((song) => ({ ...song }))
          : collectionId === "previously-played"
          ? previouslyPlayed.map((song) => ({ ...song }))
          : (
              userPlaylists.find((playlist) => playlist.id === collectionId)
                ?.songs || []
            ).map((song) => ({ ...song }));

      const selectedSong = queue[0];
      if (!selectedSong) return;

      await resolveAndPlaySong(selectedSong, {
        queue,
        currentIndex: 0,
      });
    },
    [likedSongs, previouslyPlayed, resolveAndPlaySong, userPlaylists]
  );

  const openCollectionPath = useCallback(
    (path: string) => {
      showNavigationToast(path);
      router.push(path);
    },
    [router, showNavigationToast]
  );

  const visiblePlaylistCards = useMemo(() => {
    const baseCards = [
      {
        id: "liked-songs",
        title: t("library.likedSongs"),
        subtitle: t("common.playlist"),
        meta: t("library.savedSongs", {
          count: Math.max(likedSongs.length, 1),
        }),
        searchText: buildSongSearchText(likedSongs),
        artwork: (
          <SmartPlaylistArtwork
            variant="liked"
            songs={likedSongs}
            label="Liked Songs"
            priority
          />
        ),
        onOpen: () => openCollectionPath(getLocalCollectionPath("liked-songs")),
        onPlay:
          likedSongs.length > 0
            ? () => {
                void playLocalCollection("liked-songs");
              }
            : undefined,
      },
      {
        id: "previously-played",
        title: t("library.previouslyPlayed"),
        subtitle: t("common.playlist"),
        meta: t("library.fromHistory", {
          count: previouslyPlayed.length,
        }),
        searchText: buildSongSearchText(previouslyPlayed),
        artwork: (
          <SmartPlaylistArtwork
            variant="history"
            songs={previouslyPlayed}
            label="Previously Played"
            priority
          />
        ),
        onOpen: () =>
          openCollectionPath(getLocalCollectionPath("previously-played")),
        onPlay:
          previouslyPlayed.length > 0
            ? () => {
                void playLocalCollection("previously-played");
              }
            : undefined,
      },
      ...userPlaylists.map((playlist) => ({
        id: playlist.id,
        title: playlist.name,
        subtitle: playlist.description || t("common.playlist"),
        meta: t("library.savedSongs", { count: playlist.songs.length }),
        searchText: buildSongSearchText(playlist.songs),
        artwork: (
          <SmartPlaylistArtwork
            variant="playlist"
            songs={playlist.songs}
            label={playlist.name}
          />
        ),
        onOpen: () => openCollectionPath(getLocalCollectionPath(playlist.id)),
        onPlay:
          playlist.songs.length > 0
            ? () => {
                void playLocalCollection(playlist.id);
              }
            : undefined,
      })),
    ];

    return baseCards;
  }, [
    likedSongs,
    playLocalCollection,
    previouslyPlayed,
    openCollectionPath,
    t,
    userPlaylists,
  ]);

  const pinnedPlaylistCards = useMemo(
    () => [
      ...visiblePlaylistCards.filter(
        (card) => card.id === "liked-songs" || card.id === "previously-played"
      ),
      ...visiblePlaylistCards.filter(
        (card) => card.id !== "liked-songs" && card.id !== "previously-played"
      ),
    ],
    [visiblePlaylistCards]
  );

  const recentAlbums = useMemo(() => recentSongs.slice(0, 10), [recentSongs]);

  const mixedLibraryItems = useMemo<LibraryGridItem[]>(() => {
    const artistItems = shownArtists.slice(0, 8).map((artist, index) => ({
      kind: "artist" as const,
      id: `artist-${artist.name}`,
      artist,
      priority: index < 4,
    }));

    const mediaItems = recentAlbums.slice(0, 10).map((item, index) => ({
      kind: "media" as const,
      id: `track-${item.id}`,
      title: item.title,
      subtitle: item.artist || "Track",
      meta: formatTrackDuration(item.duration),
      searchText: [item.title, item.artist].filter(Boolean).join(" "),
      artwork: (
        <SmartPlaylistArtwork
          variant="playlist"
          songs={[item]}
          label={item.title}
          priority={index < 4}
        />
      ),
      onOpen: item.audioUrl || item.coverUrl ? () => playSong(item) : undefined,
      priority: index < 4,
    }));

    return interleaveItems<LibraryGridItem>(mediaItems, artistItems);
  }, [playSong, recentAlbums, shownArtists]);

  const playlistGridItems = useMemo<LibraryGridItem[]>(
    () =>
      visiblePlaylistCards.map((card, index) => ({
        kind: "media",
        id: card.id,
        title: card.title,
        subtitle: card.subtitle,
        meta: card.meta,
        searchText: card.searchText,
        artwork: card.artwork,
        onOpen: card.onOpen,
        onPlay: card.onPlay,
        priority: index < 4,
      })),
    [visiblePlaylistCards]
  );

  const pinnedPlaylistGridItems = useMemo<LibraryGridItem[]>(
    () =>
      pinnedPlaylistCards.map((card, index) => ({
        kind: "media",
        id: `pinned-${card.id}`,
        title: card.title,
        subtitle: card.subtitle,
        meta: card.meta,
        searchText: card.searchText,
        artwork: card.artwork,
        onOpen: card.onOpen,
        onPlay: card.onPlay,
        priority: index < 4,
      })),
    [pinnedPlaylistCards]
  );

  const albumGridItems = useMemo<LibraryGridItem[]>(
    () =>
      recentAlbums.map((item, index) => ({
        kind: "media",
        id: `album-${item.id}`,
        title: item.title,
        subtitle: item.artist || "Album",
        meta: formatTrackDuration(item.duration),
        searchText: [item.title, item.artist].filter(Boolean).join(" "),
        artwork: (
          <SmartPlaylistArtwork
            variant="playlist"
            songs={[item]}
            label={item.title}
            priority={index < 4}
          />
        ),
        onOpen:
          item.audioUrl || item.coverUrl ? () => playSong(item) : undefined,
        priority: index < 4,
      })),
    [playSong, recentAlbums]
  );

  const artistGridItems = useMemo<LibraryGridItem[]>(
    () =>
      shownArtists.map((artist, index) => ({
        kind: "artist",
        id: `artist-only-${artist.name}`,
        artist,
        priority: index < 4,
      })),
    [shownArtists]
  );

  const activeGridItems = useMemo<LibraryGridItem[]>(() => {
    switch (selectedChip) {
      case "Playlists":
        return playlistGridItems;
      case "Albums":
        return albumGridItems;
      case "Artists":
        return artistGridItems;
      case "Downloaded":
      case "Podcasts & Shows":
        return [];
      default:
        return [...pinnedPlaylistGridItems, ...mixedLibraryItems];
    }
  }, [
    albumGridItems,
    artistGridItems,
    mixedLibraryItems,
    pinnedPlaylistGridItems,
    playlistGridItems,
    selectedChip,
  ]);

  const displayedGridItems = useMemo(() => {
    const query = libraryQuery.trim().toLowerCase();
    const filtered = query
      ? activeGridItems.filter((item) => {
          if (item.kind === "artist") {
            return item.artist.name.toLowerCase().includes(query);
          }

          return [item.title, item.subtitle, item.meta, item.searchText]
            .filter(Boolean)
            .join(" ")
            .toLowerCase()
            .includes(query);
        })
      : activeGridItems;

    if (sortMode === "recents") return filtered;

    const sorted = [...filtered];
    sorted.sort((left, right) => {
      const leftValue =
        left.kind === "artist"
          ? sortMode === "creator"
            ? left.artist.name
            : left.artist.name
          : sortMode === "creator"
          ? left.subtitle || left.title
          : left.title;
      const rightValue =
        right.kind === "artist"
          ? sortMode === "creator"
            ? right.artist.name
            : right.artist.name
          : sortMode === "creator"
          ? right.subtitle || right.title
          : right.title;

      return leftValue.localeCompare(rightValue, undefined, {
        sensitivity: "base",
      });
    });

    return sorted;
  }, [activeGridItems, libraryQuery, sortMode]);

  const isPlaylistView = selectedChip === "Playlists";
  const hasSearchQuery = libraryQuery.trim().length > 0;
  const librarySummary = hasSearchQuery
    ? t("library.results", { count: displayedGridItems.length })
    : t("library.playlistsSummary", {
        playlists: userPlaylists.length + 2,
        likedSongs: likedSongs.length,
      });

  const openCreatePlaylist = () => {
    setPlaylistName("");
    setPlaylistDescription("");
    setIsModalOpen(true);
  };

  const closeCreatePlaylist = () => {
    setIsModalOpen(false);
    setPlaylistName("");
    setPlaylistDescription("");
  };

  useEffect(() => {
    if (searchParams.get("createPlaylist") !== "1") return;

    setPlaylistName("");
    setPlaylistDescription("");
    setIsModalOpen(true);
    router.replace("/library", { scroll: false });
  }, [router, searchParams]);

  const submitCreatePlaylist = () => {
    const name = playlistName.trim();
    const description = playlistDescription.trim();
    if (!name) return;

    const playlist = createStoredPlaylist(name, description);
    setUserPlaylists((prev) => [playlist, ...prev]);
    closeCreatePlaylist();
    showToast({
      message: t("library.created", { name: playlist.name }),
      tone: "success",
      actionLabel: t("library.open"),
      onAction: () => {
        openCollectionPath(getLocalCollectionPath(playlist.id));
      },
    });
  };

  const handleSyncLibrary = async () => {
    const { playlists, likedSongs, snapshot } =
      buildCurrentLocalLibrarySyncSource();

    if (playlists.length === 0 && likedSongs.length === 0) {
      showToast({
        tone: "error",
        message: t("settings.syncEmpty"),
      });
      return;
    }

    setIsSyncing(true);
    showToast({
      message: t("settings.syncInProgress"),
      tone: "loading",
      durationMs: 0,
    });

    try {
      const result = await pushCloudLibrarySnapshot(snapshot);
      await refreshLocalLibrarySongMetadata();
      showToast({
        tone: "success",
        message: t("settings.syncSuccess", {
          playlists: result.syncedPlaylists,
          likes: result.syncedLikes,
        }),
      });
    } catch (error) {
      showToast({
        tone: "error",
        message:
          error instanceof Error ? error.message : t("settings.syncFailed"),
      });
    } finally {
      setIsSyncing(false);
    }
  };

  return (
    <>
      <div className="theme-surface relative h-full overflow-hidden rounded-xl border text-[color:var(--foreground)]">
        <div className="flex h-full min-h-0 w-full flex-col gap-6 rounded-xl px-4 py-4">
          <section className="rounded-xl">
            <div className="flex flex-col gap-5">
              <div className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
                <div>
                  <p className="text-base font-black tracking-tight text-[color:var(--foreground)]">
                    {t("library.yourLibrary")}
                  </p>
                </div>

                <div className="theme-muted flex items-center gap-2 sm:justify-end">
                  <button
                    type="button"
                    onClick={openCreatePlaylist}
                    className="theme-button-soft inline-flex items-center gap-1.5 rounded-full border px-3 py-1.5 text-xs font-semibold transition sm:gap-2 sm:px-4 sm:py-2 sm:text-sm"
                    aria-label={t("library.createPlaylistAria")}
                  >
                    <PlusGlyph />
                    {t("library.create")}
                  </button>
                  {authUser ? (
                    <button
                      type="button"
                      onClick={() => {
                        void handleSyncLibrary();
                      }}
                      disabled={isSyncing}
                      className="theme-button-soft inline-flex items-center gap-1.5 rounded-full border px-3 py-1.5 text-xs font-semibold transition disabled:cursor-not-allowed disabled:opacity-60 sm:gap-2 sm:px-4 sm:py-2 sm:text-sm"
                      aria-label={t("settings.syncLibrary")}
                    >
                      {isSyncing ? (
                        <span className="theme-spinner h-3.5 w-3.5" />
                      ) : (
                        <SyncGlyph />
                      )}
                      {t("settings.syncLibrary")}
                    </button>
                  ) : null}
                  <button
                    type="button"
                    onClick={() =>
                      setViewMode((current) =>
                        current === "grid" ? "list" : "grid"
                      )
                    }
                    className="theme-button-soft flex h-8 w-8 items-center justify-center rounded-full border transition sm:h-9 sm:w-9"
                    aria-label={
                      viewMode === "grid"
                        ? t("library.switchToList")
                        : t("library.switchToGrid")
                    }
                    title={
                      viewMode === "grid"
                        ? t("library.switchToList")
                        : t("library.switchToGrid")
                    }
                  >
                    {viewMode === "grid" ? <ListGlyph /> : <GridGlyph />}
                  </button>
                </div>
              </div>

              <div className="flex flex-col gap-3 xl:flex-row xl:items-center xl:justify-between">
                <div className="-mx-1 flex gap-1.5 overflow-x-auto px-1 pb-1 hide-scrollbar sm:mx-0 sm:flex-wrap sm:overflow-visible sm:px-0 sm:pb-0 sm:gap-2">
                  {FILTER_CHIPS.map((chip) => (
                    <button
                      key={chip}
                      type="button"
                      onClick={() =>
                        setSelectedChip((current) =>
                          current === chip ? null : chip
                        )
                      }
                      className={`shrink-0 rounded-full px-3 py-1.5 text-xs font-medium transition sm:px-4 sm:py-2 sm:text-sm ${
                        selectedChip === chip
                          ? "theme-button-solid"
                          : "theme-button-soft border text-[color:color-mix(in_srgb,var(--foreground)_82%,transparent)]"
                      }`}
                    >
                      {chip === "Playlists"
                        ? t("library.playlists")
                        : chip === "Podcasts & Shows"
                        ? t("library.podcastsShows")
                        : chip === "Albums"
                        ? t("search.albums")
                        : chip === "Artists"
                        ? t("library.artists")
                        : t("library.downloaded")}
                    </button>
                  ))}
                </div>

                <div className="theme-muted relative flex flex-col gap-2 text-sm sm:flex-row sm:items-center sm:gap-3">
                  <label className="theme-button-soft inline-flex items-center gap-2 rounded-xl border px-3 py-2 transition focus-within:border-[color:color-mix(in_srgb,var(--foreground)_16%,transparent)] focus-within:text-[color:var(--foreground)]">
                    <SearchGlyph />
                    <input
                      value={libraryQuery}
                      onChange={(event) => setLibraryQuery(event.target.value)}
                      placeholder={t("library.searchInLibrary")}
                      className="w-full min-w-0 bg-transparent text-sm text-[color:var(--foreground)] outline-none placeholder:text-[color:color-mix(in_srgb,var(--foreground)_35%,transparent)] sm:w-[220px]"
                      aria-label={t("library.searchInLibrary")}
                    />
                    {hasSearchQuery ? (
                      <button
                        type="button"
                        onClick={() => setLibraryQuery("")}
                        className="rounded-full p-1 text-[color:color-mix(in_srgb,var(--foreground)_45%,transparent)] transition hover:bg-[color:color-mix(in_srgb,var(--foreground)_8%,transparent)] hover:text-[color:var(--foreground)]"
                        aria-label={t("library.clearSearch")}
                      >
                        <svg
                          xmlns="http://www.w3.org/2000/svg"
                          viewBox="0 0 24 24"
                          fill="none"
                          stroke="currentColor"
                          strokeWidth="1.8"
                          className="h-3.5 w-3.5"
                          aria-hidden="true"
                        >
                          <path
                            strokeLinecap="round"
                            d="m7 7 10 10M17 7 7 17"
                          />
                        </svg>
                      </button>
                    ) : null}
                  </label>
                  <div className="relative" ref={sortMenuRef}>
                    <button
                      type="button"
                      onClick={() => setIsSortMenuOpen((value) => !value)}
                      className="theme-button-soft inline-flex items-center gap-1.5 rounded-full border px-3 py-1.5 text-xs transition sm:py-2 sm:text-sm"
                    >
                      {sortMode === "recents"
                        ? t("library.recents")
                        : sortMode === "alphabetical"
                        ? t("library.alphabetical")
                        : t("library.creator")}
                      <ChevronDownGlyph className="h-3.5 w-3.5" />
                    </button>
                    <div
                      className={`theme-overlay absolute top-full z-20 mt-2 w-44 rounded-2xl border p-1 shadow-[0_18px_40px_rgba(0,0,0,0.35)] backdrop-blur-xl transition-all duration-150 ${
                        isRtl ? "left-0" : "right-0"
                      } ${
                        isSortMenuOpen
                          ? "pointer-events-auto translate-y-0 opacity-100"
                          : "pointer-events-none -translate-y-1 opacity-0"
                      }`}
                    >
                      {[
                        { id: "recents", label: t("library.recents") },
                        {
                          id: "alphabetical",
                          label: t("library.alphabetical"),
                        },
                        { id: "creator", label: t("library.creator") },
                      ].map((option) => (
                        <button
                          key={option.id}
                          type="button"
                          onClick={() => {
                            setSortMode(option.id as SortMode);
                            setIsSortMenuOpen(false);
                          }}
                          className={`flex w-full items-center justify-between rounded-xl px-3 py-2 text-left text-sm transition ${
                            sortMode === option.id
                              ? "theme-accent-fill"
                              : "text-[color:color-mix(in_srgb,var(--foreground)_82%,transparent)] hover:bg-[color:color-mix(in_srgb,var(--foreground)_8%,transparent)]"
                          }`}
                        >
                          {option.label}
                        </button>
                      ))}
                    </div>
                  </div>
                </div>
              </div>
            </div>
          </section>

          <div className="flex items-center justify-between gap-3 px-1 text-xs uppercase tracking-[0.18em] text-[color:color-mix(in_srgb,var(--foreground)_38%,transparent)]">
            <p>{librarySummary}</p>
            <p>
              {viewMode === "grid"
                ? t("library.gridView")
                : t("library.listView")}
            </p>
          </div>

          <section
            className="min-h-0 flex-1 overflow-y-auto hide-scrollbar"
            style={{ paddingInlineEnd: "0.25rem" }}
          >
            {displayedGridItems.length > 0 ? (
              viewMode === "grid" ? (
                <div className="grid grid-cols-2 gap-x-4 gap-y-7 sm:grid-cols-3 lg:grid-cols-4 xl:grid-cols-5 2xl:grid-cols-7">
                  {displayedGridItems.map((item) =>
                    item.kind === "artist" ? (
                      <ArtistCard
                        key={item.id}
                        artist={item.artist}
                        priority={item.priority}
                      />
                    ) : (
                      <PlaylistCard
                        key={item.id}
                        title={item.title}
                        subtitle={item.subtitle}
                        meta={item.meta}
                        artwork={item.artwork}
                        onOpen={item.onOpen}
                        onPlay={item.onPlay}
                      />
                    )
                  )}

                  {isPlaylistView && (
                    <button
                      type="button"
                      onClick={openCreatePlaylist}
                      className="group text-left"
                    >
                      <div className="theme-button-soft flex aspect-square w-full items-center justify-center rounded-xl border text-[color:color-mix(in_srgb,var(--foreground)_55%,transparent)] transition group-hover:bg-[color:color-mix(in_srgb,var(--surface-3)_70%,var(--foreground)_6%)] group-hover:text-[color:color-mix(in_srgb,var(--foreground)_75%,transparent)]">
                        <PlusGlyph />
                      </div>
                      <div className="px-1 pt-3">
                        <p className="truncate text-[15px] font-semibold text-[color:var(--foreground)]">
                          {t("library.createPlaylist")}
                        </p>
                        <p className="theme-muted mt-1 text-sm">
                          {t("common.playlist")}
                        </p>
                        <p className="mt-1 text-xs text-[color:color-mix(in_srgb,var(--foreground)_38%,transparent)]">
                          {t("library.nameItYours")}
                        </p>
                      </div>
                    </button>
                  )}
                </div>
              ) : (
                <div className="space-y-1">
                  {displayedGridItems.map((item) => (
                    <LibraryListRow key={item.id} item={item} />
                  ))}
                  {isPlaylistView ? (
                    <button
                      type="button"
                      onClick={openCreatePlaylist}
                      className="theme-button-soft flex w-full items-center gap-4 rounded-2xl border border-dashed px-3 py-3 text-left text-[color:color-mix(in_srgb,var(--foreground)_72%,transparent)] transition hover:bg-[color:color-mix(in_srgb,var(--surface-3)_78%,var(--foreground)_5%)] hover:text-[color:var(--foreground)]"
                    >
                      <div className="theme-surface-soft flex h-14 w-14 shrink-0 items-center justify-center rounded-xl">
                        <PlusGlyph />
                      </div>
                      <div className="min-w-0 flex-1">
                        <p className="truncate text-sm font-semibold text-[color:var(--foreground)]">
                          {t("library.createPlaylist")}
                        </p>
                        <p className="theme-muted mt-1 text-sm">
                          {t("library.nameItYours")}
                        </p>
                      </div>
                    </button>
                  ) : null}
                </div>
              )
            ) : (
              <div className="theme-surface-soft rounded-2xl border p-5 theme-muted">
                {libraryQuery.trim()
                  ? t("library.noSearchMatch")
                  : selectedChip === "Downloaded"
                  ? t("library.downloadedEmpty")
                  : t("library.podcastsEmpty")}
              </div>
            )}
          </section>
        </div>
      </div>

      <PlaylistCreateModal
        open={isModalOpen}
        name={playlistName}
        description={playlistDescription}
        onNameChange={setPlaylistName}
        onDescriptionChange={setPlaylistDescription}
        onClose={closeCreatePlaylist}
        onSubmit={submitCreatePlaylist}
      />
    </>
  );
}
