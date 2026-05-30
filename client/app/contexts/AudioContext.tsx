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
  cachedAt?: number;
}

interface AudioContextType {
  currentSong: Song | null;
  recentSongs: Song[];
  isPlaying: boolean;
  currentTime: number;
  duration: number;
  volume: number;
  isRepeat: boolean;
  playSong: (song: Song) => void;
  pauseSong: () => void;
  resumeSong: () => void;
  seekTo: (time: number) => void;
  setVolume: (volume: number) => void;
  toggleRepeat: () => void;
  playNext: () => void;
  playPrevious: () => void;
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
  const [currentTime, setCurrentTime] = useState(0);
  const [duration, setDuration] = useState(0);
  const [volume, setVolumeState] = useState(1);
  const [isRepeat, setIsRepeat] = useState(false);

  const audioRef = useRef<HTMLAudioElement>(null);
  const intervalRef = useRef<NodeJS.Timeout | null>(null);
  const hasHydratedRef = useRef(false);

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

  // Handle time updates
  useEffect(() => {
    if (isPlaying) {
      intervalRef.current = setInterval(() => {
        if (audioRef.current) {
          setCurrentTime(audioRef.current.currentTime);
          setDuration(audioRef.current.duration || 0);
        }
      }, 1000);
    } else {
      if (intervalRef.current) {
        clearInterval(intervalRef.current);
        intervalRef.current = null;
      }
    }

    return () => {
      if (intervalRef.current) {
        clearInterval(intervalRef.current);
      }
    };
  }, [isPlaying]);

  // Handle audio ended
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
    setIsPlaying(true);
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

  const value: AudioContextType = {
    currentSong,
    recentSongs,
    isPlaying,
    currentTime,
    duration,
    volume,
    isRepeat,
    playSong,
    pauseSong,
    resumeSong,
    seekTo,
    setVolume,
    toggleRepeat,
    playNext,
    playPrevious,
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
