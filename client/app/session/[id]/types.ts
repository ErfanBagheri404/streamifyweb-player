// Local types — mirrors relevant parts of the CF Worker /session API contract.
// Source of truth: streamifysession/src/types.ts

export interface DiscordUser {
  id: string;
  username: string;
  avatar: string | null;
}

export interface QueuedTrack {
  id: string;
  title: string;
  artist: string;
  duration: number; // seconds
  thumbnail: string;
  source: string;
  requestedBy: string;
}

export interface SessionState {
  sessionId: string;
  guildId: string;
  guildName: string;
  channelId: string;
  channelName: string;
  createdBy: DiscordUser;
  createdAt: number;
  claimed: boolean;
  roles: Record<string, "admin" | "dj" | "listener">;
  userNames: Record<string, string>;
  userAvatars: Record<string, string | null>;
  current: QueuedTrack | null;
  queue: QueuedTrack[];
  isPlaying: boolean;
  loop: boolean;
  loopQueue: boolean;
  volume: number; // 0-150 (bot may go above 100)
  filter: string | null;
  searchResults: QueuedTrack[] | null;
  lastActivity: number;
  error: string | null;
  lyrics: string | null;
}

export type WSMessage =
  | { type: "state"; state: SessionState }
  | { type: "command-ack"; commandId: string; success: boolean; error?: string }
  | { type: "session-ended" }
  | { type: "error"; message: string };

export type CommandType =
  | "play"
  | "pause"
  | "resume"
  | "skip"
  | "stop"
  | "volume"
  | "loop"
  | "loopqueue"
  | "shuffle"
  | "queue-add"
  | "queue-remove"
  | "queue-move"
  | "clear"
  | "filter"
  | "search"
  | "lyrics"
  | "always-on"
  | "prev";

export type UserRole = "admin" | "dj" | "listener";

/** Helpers */

export function formatDuration(seconds: number): string {
  const m = Math.floor(seconds / 60);
  const s = Math.floor(seconds % 60);
  return `${m}:${s.toString().padStart(2, "0")}`;
}

export function roleCanControl(role: UserRole | undefined): boolean {
  return role === "admin" || role === "dj";
}
