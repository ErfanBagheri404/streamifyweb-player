"use client";

import React, {
  createContext,
  useContext,
  useState,
  useRef,
  useEffect,
  ReactNode,
} from "react";

export interface Song {
  id: string;
  title: string;
  artist: string;
  coverUrl?: string;
  audioUrl?: string;
  duration?: number;
  uploaded?: string;
  cachedAt?: number;
}

interface AudioContextType {
  currentSong: Song | null;
  recentSongs: Song[];
  isPlaying: boolean;
  isSongLoading: boolean;
  currentTime: number;
  duration: number;
  volume: number;
  isRepeat: boolean;
  beginSongLoad: (song: Song) => void;
  playSong: (song: Song) => void;
  clearSongLoading: () => void;
  pauseSong: () => void;
  resumeSong: () => void;
  seekTo: (time: number) => void;
  setVolume: (volume: number) => void;
  toggleRepeat: () => void;
  playNext: () => void;
  playPrevious: () => void;
  isFullscreenOpen: boolean;
  openFullscreen: () => void;
  closeFullscreen: () => void;
  audioRef: React.RefObject<HTMLAudioElement>;
  isPlayerVisible: boolean; // Add this
}

const AudioContext = createContext<AudioContextType | undefined>(undefined);

export const useAudio = () => {
  const context = useContext(AudioContext);
  if (!context) {
    throw new Error("useAudio must be used within an AudioProvider");
  }
  return context;
};

interface AudioProviderProps {
  children: ReactNode;
}

function resolveAudioUrl(audioUrl?: string): string {
  if (!audioUrl) return "";
  if (typeof window === "undefined") return audioUrl;

  try {
    return new URL(audioUrl, window.location.href).toString();
  } catch {
    return audioUrl;
  }
}

export const AudioProvider: React.FC<AudioProviderProps> = ({ children }) => {
  const [currentSong, setCurrentSong] = useState<Song | null>(null);
  const [recentSongs, setRecentSongs] = useState<Song[]>([]);
  const [isPlaying, setIsPlaying] = useState(false);
  const [isSongLoading, setIsSongLoading] = useState(false);
  const [currentTime, setCurrentTime] = useState(0);
  const [duration, setDuration] = useState(0);
  const [volume, setVolumeState] = useState(1);
  const [isRepeat, setIsRepeat] = useState(false);
  const [isFullscreenOpen, setIsFullscreenOpen] = useState(false);

  const audioRef = useRef<HTMLAudioElement>(null);
  const hasHydratedRef = useRef(false);
  const playbackFrameRef = useRef<number | null>(null);

  // Load saved state from localStorage on mount
  useEffect(() => {
    const savedState = localStorage.getItem("audioPlayerState");
    if (savedState) {
      try {
        const state = JSON.parse(savedState);
        const savedRecentSongs = Array.isArray(state.recentSongs)
          ? state.recentSongs
          : state.currentSong
          ? [state.currentSong]
          : [];

        setRecentSongs(savedRecentSongs);

        if (state.currentSong) {
          setCurrentSong(state.currentSong);
          setCurrentTime(state.currentTime || 0);
          setDuration(state.duration || 0);
          setVolumeState(state.volume || 1);
          setIsRepeat(state.isRepeat || false);
          setIsPlaying(Boolean(state.isPlaying));
        }
      } catch (error) {
        console.error("Error loading audio player state:", error);
      } finally {
        hasHydratedRef.current = true;
      }
    } else {
      hasHydratedRef.current = true;
    }
  }, []);

  // Save state to localStorage when it changes
  useEffect(() => {
    if (!hasHydratedRef.current) return;

    const state = {
      currentSong,
      recentSongs,
      currentTime,
      duration,
      volume,
      isRepeat,
      isPlaying,
      isSongLoading: false,
    };
    localStorage.setItem("audioPlayerState", JSON.stringify(state));
  }, [
    currentSong,
    recentSongs,
    currentTime,
    duration,
    volume,
    isRepeat,
    isPlaying,
  ]);

  useEffect(() => {
    const audio = audioRef.current;
    if (!audio || !currentSong) {
      if (isPlaying) setIsPlaying(false);
      return;
    }

    const nextAudioUrl = resolveAudioUrl(currentSong.audioUrl);
    if (!nextAudioUrl) {
      setIsPlaying(false);
      return;
    }

    if (audio.src !== nextAudioUrl) {
      audio.pause();
      audio.currentTime = 0;
      audio.src = nextAudioUrl;
      audio.load();
      setCurrentTime(0);
      setDuration(currentSong.duration || 0);
    }

    audio.volume = volume;

    if (isPlaying) {
      const playPromise = audio.play();
      if (playPromise !== undefined) {
        playPromise.catch((error) => {
          if (error.name !== "AbortError") {
            console.error("Error playing audio:", error);
            setIsPlaying(false);
          }
        });
      }
    } else {
      audio.pause();
    }
  }, [currentSong, isPlaying, volume]);

  useEffect(() => {
    const audio = audioRef.current;
    if (!audio) return;

    const syncPlaybackState = () => {
      setCurrentTime(audio.currentTime || 0);
      setDuration(audio.duration || currentSong?.duration || 0);
    };

    syncPlaybackState();

    audio.addEventListener("timeupdate", syncPlaybackState);
    audio.addEventListener("loadedmetadata", syncPlaybackState);
    audio.addEventListener("durationchange", syncPlaybackState);
    audio.addEventListener("seeking", syncPlaybackState);
    audio.addEventListener("seeked", syncPlaybackState);

    return () => {
      audio.removeEventListener("timeupdate", syncPlaybackState);
      audio.removeEventListener("loadedmetadata", syncPlaybackState);
      audio.removeEventListener("durationchange", syncPlaybackState);
      audio.removeEventListener("seeking", syncPlaybackState);
      audio.removeEventListener("seeked", syncPlaybackState);
    };
  }, [currentSong?.duration]);

  useEffect(() => {
    const audio = audioRef.current;
    if (!audio || !isPlaying) {
      if (playbackFrameRef.current !== null) {
        cancelAnimationFrame(playbackFrameRef.current);
        playbackFrameRef.current = null;
      }
      return;
    }

    const syncPlaybackFrame = () => {
      setCurrentTime(audio.currentTime || 0);
      setDuration(audio.duration || currentSong?.duration || 0);
      playbackFrameRef.current = requestAnimationFrame(syncPlaybackFrame);
    };

    playbackFrameRef.current = requestAnimationFrame(syncPlaybackFrame);

    return () => {
      if (playbackFrameRef.current !== null) {
        cancelAnimationFrame(playbackFrameRef.current);
        playbackFrameRef.current = null;
      }
    };
  }, [currentSong?.duration, isPlaying]);

  // Handle audio ended
  useEffect(() => {
    if (!currentSong && isFullscreenOpen) {
      setIsFullscreenOpen(false);
    }
  }, [currentSong, isFullscreenOpen]);

  useEffect(() => {
    const audio = audioRef.current;
    if (!audio) return;

    const handleEnded = () => {
      if (isRepeat) {
        audio.currentTime = 0;
        audio.play().catch((error) => {
          console.error("Error repeating audio:", error);
        });
      } else {
        setIsPlaying(false);
        setCurrentTime(0);
      }
    };

    audio.addEventListener("ended", handleEnded);
    return () => audio.removeEventListener("ended", handleEnded);
  }, [isRepeat]);

  const playSong = (song: Song) => {
    const audio = audioRef.current;
    const normalizedSong = {
      ...song,
      cachedAt: song.cachedAt ?? Date.now(),
    };

    if (audio) {
      audio.pause();
      audio.currentTime = 0;
    }

    setCurrentSong(normalizedSong);
    setRecentSongs((prev) => {
      const existing = prev.find((entry) => entry.id === normalizedSong.id);
      const merged = existing
        ? { ...existing, ...normalizedSong }
        : normalizedSong;
      return [
        merged,
        ...prev.filter((entry) => entry.id !== normalizedSong.id),
      ];
    });
    setCurrentTime(0);
    setDuration(normalizedSong.duration || 0);
    setIsSongLoading(false);
    setIsPlaying(true);
  };

  const beginSongLoad = (song: Song) => {
    const audio = audioRef.current;
    const normalizedSong = {
      ...song,
      cachedAt: song.cachedAt ?? Date.now(),
    };

    if (audio) {
      audio.pause();
      audio.currentTime = 0;
      audio.removeAttribute("src");
      audio.load();
    }

    setCurrentSong(normalizedSong);
    setRecentSongs((prev) => {
      const existing = prev.find((entry) => entry.id === normalizedSong.id);
      const merged = existing
        ? { ...existing, ...normalizedSong }
        : normalizedSong;
      return [
        merged,
        ...prev.filter((entry) => entry.id !== normalizedSong.id),
      ];
    });
    setCurrentTime(0);
    setDuration(normalizedSong.duration || 0);
    setIsPlaying(false);
    setIsSongLoading(true);
  };

  const clearSongLoading = () => {
    setIsSongLoading(false);
  };

  const pauseSong = () => {
    setIsPlaying(false);
    if (audioRef.current) {
      audioRef.current.pause();
    }
  };

  const resumeSong = () => {
    if (audioRef.current && currentSong) {
      setIsPlaying(true);
      audioRef.current.play().catch((error) => {
        console.error("Error resuming audio:", error);
        setIsPlaying(false);
      });
    }
  };

  const seekTo = (time: number) => {
    if (audioRef.current) {
      audioRef.current.currentTime = time;
      setCurrentTime(time);
    }
  };

  const setVolume = (newVolume: number) => {
    const clampedVolume = Math.max(0, Math.min(1, newVolume));
    setVolumeState(clampedVolume);
    if (audioRef.current) {
      audioRef.current.volume = clampedVolume;
    }
  };

  const toggleRepeat = () => {
    setIsRepeat((prev) => !prev);
  };

  const playNext = () => {
    // This would be implemented with a playlist/queue system
    console.log("Play next song");
  };

  const playPrevious = () => {
    if (recentSongs.length > 1) {
      playSong(recentSongs[1]);
    }
  };

  const openFullscreen = () => {
    if (currentSong) {
      setIsFullscreenOpen(true);
    }
  };

  const closeFullscreen = () => {
    setIsFullscreenOpen(false);
  };

  const value: AudioContextType = {
    currentSong,
    recentSongs,
    isPlaying,
    isSongLoading,
    currentTime,
    duration,
    volume,
    isRepeat,
    beginSongLoad,
    playSong,
    clearSongLoading,
    pauseSong,
    resumeSong,
    seekTo,
    setVolume,
    toggleRepeat,
    playNext,
    playPrevious,
    isFullscreenOpen,
    openFullscreen,
    closeFullscreen,
    audioRef,
    isPlayerVisible: currentSong !== null, // Player is visible if a song is loaded
  };

  return (
    <AudioContext.Provider value={value}>
      {children}
      <audio
        ref={audioRef}
        className="hidden"
        crossOrigin="anonymous"
        preload="auto"
      />
    </AudioContext.Provider>
  );
};
