"use client";

import { useState, useEffect, useCallback } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import type { DiscordUser } from "../session/[id]/types";

const SESSION_URL = process.env.NEXT_PUBLIC_SESSION_URL ?? "";
const DISCORD_CLIENT_ID = process.env.NEXT_PUBLIC_DISCORD_CLIENT_ID ?? "1532405105104654452";
const STORAGE_KEY = "streamify-discord-user";

function getDiscordAuthUrl() {
  const origin = typeof window !== "undefined" ? window.location.origin : "http://localhost:3000";
  const redirect = encodeURIComponent(`${origin}/api/discord/callback`);
  return `https://discord.com/api/oauth2/authorize?client_id=${DISCORD_CLIENT_ID}&response_type=code&redirect_uri=${redirect}&scope=identify`;
}

export default function SessionsPage() {
  const router = useRouter();
  const [discordUser, setDiscordUser] = useState<DiscordUser | null>(null);
  const [loadingAuth, setLoadingAuth] = useState(true);
  const [sessionId, setSessionId] = useState("");
  const [creating, setCreating] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [recentSessions, setRecentSessions] = useState<string[]>([]);

  // Load stored Discord user + recent sessions on mount
  useEffect(() => {
    try {
      const raw = localStorage.getItem(STORAGE_KEY);
      if (raw) setDiscordUser(JSON.parse(raw));
    } catch {}
    try {
      const raw = localStorage.getItem("streamifyRecentSessions");
      if (raw) setRecentSessions(JSON.parse(raw));
    } catch {}
    setLoadingAuth(false);
  }, []);

  // Listen for Discord OAuth popup callback
  useEffect(() => {
    const handler = (e: MessageEvent) => {
      if (e.data?.type === "discord-auth" && e.data.user) {
        setDiscordUser(e.data.user);
        localStorage.setItem(STORAGE_KEY, JSON.stringify(e.data.user));
      }
    };
    window.addEventListener("message", handler);
    return () => window.removeEventListener("message", handler);
  }, []);

  const connectDiscord = useCallback(() => {
    const w = 500;
    const h = 700;
    const left = screen.width / 2 - w / 2;
    const top = screen.height / 2 - h / 2;
    window.open(getDiscordAuthUrl(), "discord-auth", `width=${w},height=${h},left=${left},top=${top}`);
  }, []);

  const disconnectDiscord = useCallback(() => {
    setDiscordUser(null);
    localStorage.removeItem(STORAGE_KEY);
  }, []);

  const saveRecent = (id: string) => {
    try {
      const next = [id, ...recentSessions.filter((s) => s !== id)].slice(0, 5);
      setRecentSessions(next);
      localStorage.setItem("streamifyRecentSessions", JSON.stringify(next));
    } catch {}
  };

  const handleCreate = async () => {
    setCreating(true);
    setError(null);
    try {
      const id = crypto.randomUUID();
      if (SESSION_URL) {
        // Non-blocking: if CF Worker is unreachable (Iran network), still navigate
        fetch(`${SESSION_URL}/session/create-pending`, {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ sessionId: id }),
        }).catch(() => {});
      }
      saveRecent(id);
      router.push(`/session/${id}`);
    } catch (e: any) {
      setError(e.message || "Failed");
    } finally {
      setCreating(false);
    }
  };

  const handleJoin = (e: React.FormEvent) => {
    e.preventDefault();
    const id = sessionId.trim();
    if (!id) return;
    saveRecent(id);
    router.push(`/session/${id}`);
  };

  const notConnected = !loadingAuth && !discordUser;

  return (
    <div
      className="flex h-full min-h-0 flex-col overflow-hidden"
      style={{ background: "var(--background)", color: "var(--foreground)" }}
    >
      {/* Header */}
      <div className="mb-4 flex items-center gap-3">
        <div
          className="flex h-9 w-9 items-center justify-center rounded-xl flex-shrink-0"
          style={{ background: "var(--surface-3)" }}
        >
          <svg viewBox="0 0 24 24" fill="currentColor" className="h-5 w-5" style={{ color: "var(--foreground)" }}>
            <path d="M20.317 4.37a19.791 19.791 0 0 0-4.885-1.515.074.074 0 0 0-.079.037c-.21.375-.444.864-.608 1.25a18.27 18.27 0 0 0-5.487 0 12.64 12.64 0 0 0-.617-1.25.077.077 0 0 0-.079-.037A19.736 19.736 0 0 0 3.677 4.37a.07.07 0 0 0-.032.027C.533 9.046-.32 13.58.099 18.057a.082.082 0 0 0 .031.057 19.9 19.9 0 0 0 5.993 3.03.078.078 0 0 0 .084-.028c.462-.63.874-1.295 1.226-1.994a.076.076 0 0 0-.041-.106 13.107 13.107 0 0 1-1.872-.892.077.077 0 0 1-.008-.128 10.2 10.2 0 0 0 .372-.292.074.074 0 0 1 .077-.01c3.928 1.793 8.18 1.793 12.062 0a.074.074 0 0 1 .078.01c.12.098.246.198.373.292a.077.077 0 0 1-.006.127 12.299 12.299 0 0 1-1.873.892.077.077 0 0 0-.041.107c.36.698.772 1.362 1.225 1.993a.076.076 0 0 0 .084.028 19.839 19.839 0 0 0 6.002-3.03.077.077 0 0 0 .032-.054c.5-5.177-.838-9.674-3.549-13.66a.061.061 0 0 0-.031-.03zM8.02 15.33c-1.183 0-2.157-1.085-2.157-2.419 0-1.333.956-2.419 2.157-2.419 1.21 0 2.176 1.095 2.157 2.42 0 1.333-.956 2.418-2.157 2.418zm7.975 0c-1.183 0-2.157-1.085-2.157-2.419 0-1.333.955-2.419 2.157-2.419 1.21 0 2.176 1.095 2.157 2.42 0 1.333-.946 2.418-2.157 2.418z" />
          </svg>
        </div>
        <div className="min-w-0 flex-1">
          <h1 className="text-lg font-bold leading-tight">Sessions</h1>
          <p className="text-xs" style={{ color: "color-mix(in srgb, var(--foreground) 45%, transparent)" }}>
            Control your Discord music bot from the web
          </p>
        </div>

        {/* Discord user badge in header */}
        {discordUser && (
          <div className="flex items-center gap-2 ml-auto">
            <div className="flex items-center gap-2 rounded-lg px-3 py-1.5 text-xs" style={{ background: "var(--surface-3)" }}>
              {discordUser.avatar && (
                <img
                  src={`https://cdn.discordapp.com/avatars/${discordUser.id}/${discordUser.avatar}.png`}
                  alt=""
                  className="h-5 w-5 rounded-full"
                />
              )}
              <span className="font-medium">{discordUser.username}</span>
            </div>
            <button
              onClick={disconnectDiscord}
              className="text-xs px-2 py-1 rounded-lg transition-colors"
              style={{ color: "var(--muted-foreground)" }}
              onMouseEnter={(e) => (e.currentTarget.style.color = "var(--foreground)")}
              onMouseLeave={(e) => (e.currentTarget.style.color = "var(--muted-foreground)")}
            >
              Disconnect
            </button>
          </div>
        )}
      </div>

      {/* Content */}
      {notConnected ? (
        /* Discord connect prompt */
        <div className="flex flex-1 items-center justify-center">
          <div
            className="flex flex-col items-center gap-4 rounded-2xl border p-8 sm:p-10 text-center max-w-sm"
            style={{ background: "var(--surface-1)", borderColor: "var(--border-subtle)" }}
          >
            <div
              className="flex h-14 w-14 items-center justify-center rounded-2xl"
              style={{ background: "var(--surface-3)" }}
            >
              <svg viewBox="0 0 24 24" fill="currentColor" className="h-8 w-8" style={{ color: "var(--foreground)" }}>
                <path d="M20.317 4.37a19.791 19.791 0 0 0-4.885-1.515.074.074 0 0 0-.079.037c-.21.375-.444.864-.608 1.25a18.27 18.27 0 0 0-5.487 0 12.64 12.64 0 0 0-.617-1.25.077.077 0 0 0-.079-.037A19.736 19.736 0 0 0 3.677 4.37a.07.07 0 0 0-.032.027C.533 9.046-.32 13.58.099 18.057a.082.082 0 0 0 .031.057 19.9 19.9 0 0 0 5.993 3.03.078.078 0 0 0 .084-.028c.462-.63.874-1.295 1.226-1.994a.076.076 0 0 0-.041-.106 13.107 13.107 0 0 1-1.872-.892.077.077 0 0 1-.008-.128 10.2 10.2 0 0 0 .372-.292.074.074 0 0 1 .077-.01c3.928 1.793 8.18 1.793 12.062 0a.074.074 0 0 1 .078.01c.12.098.246.198.373.292a.077.077 0 0 1-.006.127 12.299 12.299 0 0 1-1.873.892.077.077 0 0 0-.041.107c.36.698.772 1.362 1.225 1.993a.076.076 0 0 0 .084.028 19.839 19.839 0 0 0 6.002-3.03.077.077 0 0 0 .032-.054c.5-5.177-.838-9.674-3.549-13.66a.061.061 0 0 0-.031-.03zM8.02 15.33c-1.183 0-2.157-1.085-2.157-2.419 0-1.333.956-2.419 2.157-2.419 1.21 0 2.176 1.095 2.157 2.42 0 1.333-.956 2.418-2.157 2.418zm7.975 0c-1.183 0-2.157-1.085-2.157-2.419 0-1.333.955-2.419 2.157-2.419 1.21 0 2.176 1.095 2.157 2.42 0 1.333-.946 2.418-2.157 2.418z" />
              </svg>
            </div>
            <div>
              <h2 className="text-base font-semibold">Connect with Discord</h2>
              <p className="mt-1 text-xs leading-relaxed" style={{ color: "var(--muted-foreground)" }}>
                Sign in to create or join sessions. Your Discord identity is used to determine your role.
              </p>
            </div>
            <button
              onClick={connectDiscord}
              className="w-full rounded-xl px-4 py-2.5 text-sm font-semibold transition"
              style={{ background: "#5865F2", color: "#fff" }}
            >
              Connect Discord
            </button>
          </div>
        </div>
      ) : (
        /* Cards row */
        <div className="flex min-h-0 flex-1 flex-col gap-3 sm:flex-row">
          {/* Create */}
          <div
            className="flex flex-1 flex-col rounded-2xl border p-4 sm:p-5"
            style={{ background: "var(--surface-1)", borderColor: "var(--border-subtle)" }}
          >
            <h2 className="text-sm font-semibold">Create Session</h2>
            <p className="mt-1 text-xs leading-relaxed" style={{ color: "color-mix(in srgb, var(--foreground) 40%, transparent)" }}>
              Start a new session and link it in Discord with{" "}
              <code className="rounded px-1 py-0.5 text-[10px]" style={{ background: "var(--surface-3)" }}>
                /session link &lt;id&gt;
              </code>
            </p>
            <button
              onClick={handleCreate}
              disabled={creating}
              className="mt-auto w-full rounded-xl px-4 py-2.5 text-sm font-semibold transition disabled:opacity-40"
              style={{ background: "var(--foreground)", color: "var(--background)" }}
            >
              {creating ? "Creating..." : "Create"}
            </button>
          </div>

          {/* Join */}
          <div
            className="flex flex-1 flex-col rounded-2xl border p-4 sm:p-5"
            style={{ background: "var(--surface-1)", borderColor: "var(--border-subtle)" }}
          >
            <h2 className="text-sm font-semibold">Join Session</h2>
            <p className="mt-1 text-xs leading-relaxed" style={{ color: "color-mix(in srgb, var(--foreground) 40%, transparent)" }}>
              Enter a session ID from Discord or a friend.
            </p>
            <form onSubmit={handleJoin} className="mt-auto flex gap-2">
              <input
                value={sessionId}
                onChange={(e) => setSessionId(e.target.value)}
                placeholder="Session ID"
                className="min-w-0 flex-1 rounded-xl border px-3 py-2.5 text-xs outline-none transition placeholder:opacity-30 focus:opacity-100"
                style={{ background: "var(--surface-3)", borderColor: "var(--border-subtle)", color: "var(--foreground)" }}
              />
              <button
                type="submit"
                disabled={!sessionId.trim()}
                className="shrink-0 rounded-xl px-4 py-2.5 text-xs font-semibold transition disabled:opacity-30"
                style={{ background: "var(--surface-3)", color: "var(--foreground)" }}
              >
                Join
              </button>
            </form>
          </div>

          {/* Recent */}
          {recentSessions.length > 0 && (
            <div
              className="flex flex-1 flex-col rounded-2xl border p-4 sm:p-5"
              style={{ background: "var(--surface-1)", borderColor: "var(--border-subtle)" }}
            >
              <h2 className="text-sm font-semibold">Recent</h2>
              <div className="mt-2 flex min-h-0 flex-1 flex-col gap-1.5 overflow-y-auto">
                {recentSessions.map((id) => (
                  <Link
                    key={id}
                    href={`/session/${id}`}
                    className="flex items-center justify-between rounded-lg px-3 py-2 text-xs transition"
                    style={{ background: "var(--surface-3)" }}
                  >
                    <span className="font-mono opacity-70">{id}</span>
                    <span className="opacity-30">{"\u2192"}</span>
                  </Link>
                ))}
              </div>
            </div>
          )}
        </div>
      )}

      {error && (
        <div
          className="mt-3 rounded-xl border px-4 py-2.5 text-xs"
          style={{ background: "rgba(239,68,68,0.08)", borderColor: "rgba(239,68,68,0.2)", color: "#f87171" }}
        >
          {error}
        </div>
      )}

      {!SESSION_URL && (
        <p className="mt-2 text-center text-[10px]" style={{ color: "color-mix(in srgb, var(--foreground) 25%, transparent)" }}>
          NEXT_PUBLIC_SESSION_URL not configured
        </p>
      )}
    </div>
  );
}
