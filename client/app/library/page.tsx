"use client";

import React, { useEffect, useMemo, useState } from "react";
import Image from "next/image";
import { useRouter } from "next/navigation";
import { type Song, useAudio } from "../contexts/AudioContext";

type FilterChip =
  | "Playlists"
  | "Podcasts & Shows"
  | "Albums"
  | "Artists"
  | "Downloaded";

interface StoredPlaylist {
  id: string;
  name: string;
  description: string;
  createdAt: number;
}

interface ArtistSummary {
  name: string;
  count: number;
  image?: string;
}

const FILTER_CHIPS: FilterChip[] = [
  "Playlists",
  "Podcasts & Shows",
  "Albums",
  "Artists",
  "Downloaded",
];
const PLAYLISTS_STORAGE_KEY = "libraryUserPlaylists";

function readStoredPlaylists(): StoredPlaylist[] {
  if (typeof window === "undefined") {
    return [];
  }

  try {
    const raw = window.localStorage.getItem(PLAYLISTS_STORAGE_KEY);
    if (!raw) {
      return [];
    }

    const parsed = JSON.parse(raw) as StoredPlaylist[];
    return Array.isArray(parsed) ? parsed : [];
  } catch (error) {
    console.error("Failed to restore playlists:", error);
    return [];
  }
}

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

function createPlaylistId(): string {
  if (
    typeof crypto !== "undefined" &&
    typeof crypto.randomUUID === "function"
  ) {
    return crypto.randomUUID();
  }

  return `playlist-${Date.now()}-${Math.random().toString(36).slice(2, 8)}`;
}

function LibraryGlyph() {
  return (
    <svg
      xmlns="http://www.w3.org/2000/svg"
      viewBox="0 0 24 24"
      fill="none"
      stroke="currentColor"
      strokeWidth="1.8"
      className="h-5 w-5"
      aria-hidden="true"
    >
      <path
        strokeLinecap="round"
        d="M5 5.75h.5a2.25 2.25 0 0 1 2.25 2.25v9.5A1.75 1.75 0 0 1 6 19.25H5.75A1.75 1.75 0 0 1 4 17.5V6.75A1 1 0 0 1 5 5.75Z"
      />
      <path
        strokeLinecap="round"
        d="M10.25 4.75h.5A2.25 2.25 0 0 1 13 7v10.5a1.75 1.75 0 0 1-1.75 1.75H11A1.75 1.75 0 0 1 9.25 17.5V5.75a1 1 0 0 1 1-1Z"
      />
      <path
        strokeLinecap="round"
        d="M15.5 7.25h.5A2.25 2.25 0 0 1 18.25 9.5v8a1.75 1.75 0 0 1-1.75 1.75h-.25a1.75 1.75 0 0 1-1.75-1.75V8.25a1 1 0 0 1 1-1Z"
      />
    </svg>
  );
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
}: {
  variant: "liked" | "history" | "playlist";
  songs: Song[];
  label: string;
}) {
  if (variant === "liked") {
    return (
      <div className="flex aspect-square w-full items-center justify-center rounded-xl bg-gradient-to-br from-[#5f4bff] via-[#8a7dff] to-[#d7f9e9] text-white shadow-[0_18px_40px_rgba(95,75,255,0.35)]">
        <HeartGlyph />
      </div>
    );
  }

  if (variant === "history") {
    const covers = songs.filter((song) => song.coverUrl).slice(0, 4);

    if (covers.length > 0) {
      return (
        <div className="grid aspect-square w-full grid-cols-2 overflow-hidden rounded-xl bg-white/6">
          {covers.map((song) => (
            <div key={song.id} className="relative h-full w-full">
              <Image
                src={song.coverUrl!}
                alt={song.title}
                fill
                sizes="(max-width: 768px) 40vw, 180px"
                className="object-cover"
                unoptimized
              />
            </div>
          ))}
          {covers.length < 4 &&
            [...Array(4 - covers.length)].map((_, index) => (
              <div
                key={`history-empty-${index}`}
                className="flex items-center justify-center bg-white/6 text-white/45"
              >
                <ClockGlyph />
              </div>
            ))}
        </div>
      );
    }

    return (
      <div className="flex aspect-square w-full items-center justify-center rounded-xl bg-gradient-to-br from-[#245d8f] via-[#1a4b70] to-[#121212] text-white shadow-[0_18px_40px_rgba(20,70,120,0.32)]">
        <ClockGlyph />
      </div>
    );
  }

  const firstCover = songs.find((song) => song.coverUrl)?.coverUrl;

  if (firstCover) {
    return (
      <div className="relative aspect-square w-full overflow-hidden rounded-xl bg-white/6">
        <Image
          src={firstCover}
          alt={label}
          fill
          sizes="(max-width: 768px) 40vw, 180px"
          className="object-cover"
          unoptimized
        />
      </div>
    );
  }

  return (
    <div className="flex aspect-square w-full items-center justify-center rounded-xl bg-[#2b2b2b] text-white/60">
      <FolderGlyph />
    </div>
  );
}

function PlaylistCard({
  title,
  subtitle,
  meta,
  artwork,
  onClick,
}: {
  title: string;
  subtitle: string;
  meta: string;
  artwork: React.ReactNode;
  onClick?: () => void;
}) {
  const Component = onClick ? "button" : "div";

  return (
    <Component
      type={onClick ? "button" : undefined}
      onClick={onClick}
      className="group text-left"
    >
      <div className="relative overflow-hidden rounded-xl bg-[#181818] transition duration-200 group-hover:bg-[#222222]">
        {artwork}
        {onClick && (
          <div className="pointer-events-none absolute bottom-3 right-3 flex h-12 w-12 translate-y-2 items-center justify-center rounded-full bg-[#1ed760] text-black opacity-0 shadow-[0_12px_24px_rgba(0,0,0,0.35)] transition-all duration-200 group-hover:translate-y-0 group-hover:opacity-100">
            <PlayGlyph />
          </div>
        )}
      </div>
      <div className="px-1 pt-3">
        <p className="truncate text-[15px] font-semibold text-white">{title}</p>
        <p className="mt-1 truncate text-sm text-white/55">{subtitle}</p>
        <p className="mt-1 truncate text-xs text-white/38">{meta}</p>
      </div>
    </Component>
  );
}

function ArtistCard({ artist }: { artist: ArtistSummary }) {
  return (
    <div className="group text-left">
      <div className="relative aspect-square overflow-hidden rounded-full bg-[#181818] transition duration-200 group-hover:bg-[#222222]">
        {artist.image ? (
          <Image
            src={artist.image}
            alt={artist.name}
            fill
            sizes="(max-width: 768px) 40vw, 180px"
            className="object-cover"
            unoptimized
          />
        ) : (
          <div className="flex h-full w-full items-center justify-center bg-gradient-to-br from-[#3b3b3b] to-[#161616] text-2xl font-semibold text-white/80">
            {getInitials(artist.name)}
          </div>
        )}
      </div>
      <div className="px-1 pt-3">
        <p className="truncate text-[15px] font-semibold text-white">
          {artist.name}
        </p>
        <p className="mt-1 text-sm text-white/55">Artist</p>
      </div>
    </div>
  );
}

function CreatePlaylistModal({
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
  if (!open) return null;

  const canSubmit = name.trim().length > 0;
  const previewName = name.trim() || "My Playlist";
  const previewDescription =
    description.trim() || "Add an optional description for your playlist.";

  return (
    <div
      className="fixed inset-0 z-50 flex items-center justify-center bg-black/70 px-4 backdrop-blur-sm"
      onClick={onClose}
    >
      <div
        className="w-full max-w-2xl rounded-3xl bg-[#282828] p-6 shadow-[0_24px_64px_rgba(0,0,0,0.45)] md:p-7"
        onClick={(event) => event.stopPropagation()}
      >
        <div className="flex items-start justify-between gap-4">
          <div>
            <h2 className="text-2xl font-bold text-white">Create playlist</h2>
            <p className="mt-1 text-sm text-white/55">
              Give it a name and description, then save it to your library.
            </p>
          </div>
          <button
            type="button"
            onClick={onClose}
            className="rounded-full p-2 text-white/55 transition hover:bg-white/8 hover:text-white"
            aria-label="Close playlist modal"
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
          <div className="rounded-2xl bg-[#202020] p-4">
            <div className="mx-auto flex aspect-square w-full max-w-[220px] items-center justify-center rounded-2xl bg-gradient-to-br from-[#4731c8] via-[#795bff] to-[#b7f4d8] text-white shadow-[0_20px_45px_rgba(71,49,200,0.4)]">
              <FolderGlyph />
            </div>
            <div className="mt-4 px-1">
              <p className="truncate text-lg font-semibold text-white">
                {previewName}
              </p>
              <p className="mt-2 line-clamp-3 text-sm text-white/55">
                {previewDescription}
              </p>
            </div>
          </div>

          <div className="space-y-4">
            <label className="block">
              <span className="mb-2 block text-sm font-medium text-white/75">
                Name
              </span>
              <input
                value={name}
                onChange={(event) => onNameChange(event.target.value)}
                placeholder="My Playlist"
                className="w-full rounded-xl border border-white/10 bg-[#3e3e3e] px-4 py-3 text-white outline-none transition placeholder:text-white/30 focus:border-white/30"
              />
            </label>

            <label className="block">
              <span className="mb-2 block text-sm font-medium text-white/75">
                Description
              </span>
              <textarea
                value={description}
                onChange={(event) => onDescriptionChange(event.target.value)}
                placeholder="What is this playlist for?"
                rows={7}
                className="w-full resize-none rounded-xl border border-white/10 bg-[#3e3e3e] px-4 py-3 text-white outline-none transition placeholder:text-white/30 focus:border-white/30"
              />
            </label>
          </div>
        </div>

        <div className="mt-6 flex items-center justify-end gap-3">
          <button
            type="button"
            onClick={onClose}
            className="rounded-full px-4 py-2 text-sm font-semibold text-white/65 transition hover:text-white"
          >
            Cancel
          </button>
          <button
            type="button"
            onClick={onSubmit}
            disabled={!canSubmit}
            className="rounded-full bg-white px-5 py-2.5 text-sm font-semibold text-black transition hover:scale-[1.02] disabled:cursor-not-allowed disabled:opacity-40 disabled:hover:scale-100"
          >
            Create
          </button>
        </div>
      </div>
    </div>
  );
}

export default function LibraryPage() {
  const router = useRouter();
  const { recentSongs, playSong } = useAudio();
  const [selectedChip, setSelectedChip] = useState<FilterChip>("Playlists");
  const [userPlaylists, setUserPlaylists] =
    useState<StoredPlaylist[]>(readStoredPlaylists);
  const [isModalOpen, setIsModalOpen] = useState(false);
  const [playlistName, setPlaylistName] = useState("");
  const [playlistDescription, setPlaylistDescription] = useState("");

  useEffect(() => {
    if (typeof window === "undefined") return;
    window.localStorage.setItem(
      PLAYLISTS_STORAGE_KEY,
      JSON.stringify(userPlaylists)
    );
  }, [userPlaylists]);

  const topArtists = useMemo<ArtistSummary[]>(() => {
    const map = new Map<string, ArtistSummary>();

    for (const song of recentSongs) {
      const key = song.artist?.trim() || "Unknown Artist";
      const existing = map.get(key);
      map.set(key, {
        name: key,
        count: (existing?.count ?? 0) + 1,
        image: existing?.image || song.coverUrl,
      });
    }

    return [...map.values()].sort((a, b) => b.count - a.count).slice(0, 5);
  }, [recentSongs]);

  const shownArtists = useMemo(
    () =>
      topArtists.length > 0
        ? topArtists
        : [
            { name: "Discover more", count: 0 },
            { name: "Your next artist", count: 0 },
          ],
    [topArtists]
  );

  const likedSongs = useMemo(() => recentSongs.slice(0, 12), [recentSongs]);
  const previouslyPlayed = useMemo(
    () => recentSongs.slice(0, 20),
    [recentSongs]
  );
  const recentTracks = useMemo(() => recentSongs.slice(0, 4), [recentSongs]);

  const visiblePlaylistCards = useMemo(() => {
    const baseCards = [
      {
        id: "liked-songs",
        title: "Liked Songs",
        subtitle: "Playlist",
        meta: `${formatSongCount(
          Math.max(likedSongs.length, 1),
          "song"
        )} saved`,
        artwork: (
          <SmartPlaylistArtwork
            variant="liked"
            songs={likedSongs}
            label="Liked Songs"
          />
        ),
        onClick: likedSongs[0] ? () => playSong(likedSongs[0]) : undefined,
      },
      {
        id: "previously-played",
        title: "Previously Played",
        subtitle: "Playlist",
        meta: `${formatSongCount(
          previouslyPlayed.length,
          "track"
        )} from your history`,
        artwork: (
          <SmartPlaylistArtwork
            variant="history"
            songs={previouslyPlayed}
            label="Previously Played"
          />
        ),
        onClick: previouslyPlayed[0]
          ? () => playSong(previouslyPlayed[0])
          : undefined,
      },
      ...userPlaylists.map((playlist) => ({
        id: playlist.id,
        title: playlist.name,
        subtitle: playlist.description || "Custom playlist",
        meta: "Playlist",
        artwork: (
          <SmartPlaylistArtwork
            variant="playlist"
            songs={recentTracks}
            label={playlist.name}
          />
        ),
        onClick: undefined as (() => void) | undefined,
      })),
    ];

    return baseCards;
  }, [likedSongs, playSong, previouslyPlayed, recentTracks, userPlaylists]);

  const recentAlbums = useMemo(
    () =>
      recentSongs.length > 0
        ? recentSongs.slice(0, 4)
        : [
            {
              id: "album-placeholder-1",
              title: "Play something new",
              artist: "Album",
            },
            {
              id: "album-placeholder-2",
              title: "Your next replay",
              artist: "Album",
            },
          ],
    [recentSongs]
  );

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

  const submitCreatePlaylist = () => {
    const name = playlistName.trim();
    const description = playlistDescription.trim();
    if (!name) return;

    setUserPlaylists((prev) => [
      {
        id: createPlaylistId(),
        name,
        description,
        createdAt: Date.now(),
      },
      ...prev,
    ]);
    closeCreatePlaylist();
  };

  return (
    <>
      <div className="min-h-full bg-[#181818] rounded-xl text-white pb-15">
        <div className="flex w-full flex-col gap-8 px-4 py-4 rounded-xl">
          <section className="rounded-xl ">
            <div className="flex flex-col gap-5">
              <div className="flex items-center justify-between gap-4">
                <div className="flex items-center gap-3">
                  <div className="flex h-10 w-10 items-center justify-center rounded-xl bg-white/6 text-white">
                    <LibraryGlyph />
                  </div>
                  <div>
                    <p className="text-sm font-semibold text-white/72">
                      Your Library
                    </p>
                  </div>
                </div>

                <div className="flex items-center gap-2 text-white/65">
                  <button
                    type="button"
                    onClick={openCreatePlaylist}
                    className="flex h-9 w-9 items-center justify-center rounded-full transition hover:bg-white/8 hover:text-white"
                    aria-label="Create playlist"
                  >
                    <PlusGlyph />
                  </button>
                  <button
                    type="button"
                    className="flex h-9 w-9 items-center justify-center rounded-full transition hover:bg-white/8 hover:text-white"
                    aria-label="Change library view"
                  >
                    <GridGlyph />
                  </button>
                </div>
              </div>

              <div className="flex flex-col gap-3 xl:flex-row xl:items-center xl:justify-between">
                <div className="flex flex-wrap gap-2">
                  {FILTER_CHIPS.map((chip) => (
                    <button
                      key={chip}
                      type="button"
                      onClick={() => setSelectedChip(chip)}
                      className={`rounded-full px-4 py-2 text-sm font-medium transition ${
                        selectedChip === chip
                          ? "bg-white text-black"
                          : "bg-white/8 text-white/82 hover:bg-white/12"
                      }`}
                    >
                      {chip}
                    </button>
                  ))}
                </div>

                <div className="flex items-center gap-3 text-sm text-white/55">
                  <button
                    type="button"
                    onClick={() => router.push("/search")}
                    className="flex h-9 w-9 items-center justify-center rounded-full transition hover:bg-white/8 hover:text-white"
                    aria-label="Search music"
                  >
                    <SearchGlyph />
                  </button>
                  <button
                    type="button"
                    className="inline-flex items-center gap-1.5 rounded-full px-3 py-2 transition hover:bg-white/8 hover:text-white"
                  >
                    Recents
                    <ChevronDownGlyph className="h-3.5 w-3.5" />
                  </button>
                </div>
              </div>
            </div>
          </section>

          <section>
            <div className="grid grid-cols-2 gap-x-4 gap-y-7 md:grid-cols-3 xl:grid-cols-4">
              {visiblePlaylistCards.map((card) => (
                <PlaylistCard
                  key={card.id}
                  title={card.title}
                  subtitle={card.subtitle}
                  meta={card.meta}
                  artwork={card.artwork}
                  onClick={card.onClick}
                />
              ))}

              <button
                type="button"
                onClick={openCreatePlaylist}
                className="group text-left"
              >
                <div className="flex aspect-square w-full items-center justify-center rounded-xl bg-[#1c1c1c] text-white/55 transition group-hover:bg-[#232323] group-hover:text-white/75">
                  <PlusGlyph />
                </div>
                <div className="px-1 pt-3">
                  <p className="truncate text-[15px] font-semibold text-white">
                    Create playlist
                  </p>
                  <p className="mt-1 text-sm text-white/55">Playlist</p>
                  <p className="mt-1 text-xs text-white/38">
                    Name it and make it yours
                  </p>
                </div>
              </button>
            </div>
          </section>

          <section className="grid gap-8 xl:grid-cols-[1.05fr_0.95fr]">
            <div>
              <div className="mb-4 flex items-center justify-between gap-4">
                <h2 className="text-2xl font-bold tracking-tight">Artists</h2>
                <button
                  type="button"
                  onClick={() => router.push("/search")}
                  className="text-sm font-medium text-white/55 transition hover:text-white"
                >
                  Show all
                </button>
              </div>

              <div className="grid grid-cols-2 gap-5 md:grid-cols-3 xl:grid-cols-5">
                {shownArtists.map((artist) => (
                  <ArtistCard key={artist.name} artist={artist} />
                ))}
              </div>
            </div>

            <div>
              <div className="mb-4 flex items-center justify-between gap-4">
                <h2 className="text-2xl font-bold tracking-tight">
                  Recently played
                </h2>
                <button
                  type="button"
                  onClick={() => router.push("/search")}
                  className="text-sm font-medium text-white/55 transition hover:text-white"
                >
                  Show all
                </button>
              </div>

              <div className="grid grid-cols-2 gap-5">
                {recentAlbums.map((item) => (
                  <PlaylistCard
                    key={item.id}
                    title={item.title}
                    subtitle={item.artist || "Track"}
                    meta={
                      item.duration
                        ? formatSongCount(Math.max(item.duration, 1), "second")
                        : "Recently played"
                    }
                    artwork={
                      <SmartPlaylistArtwork
                        variant="playlist"
                        songs={[item]}
                        label={item.title}
                      />
                    }
                    onClick={
                      item.audioUrl || item.coverUrl
                        ? () => playSong(item)
                        : undefined
                    }
                  />
                ))}
              </div>
            </div>
          </section>
        </div>
      </div>

      <CreatePlaylistModal
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
