"use client";

import { use, useCallback, useMemo, useState } from "react";
import { useSession } from "./useSession";
import { SessionPlayer } from "./SessionPlayer";
import { SessionQueue } from "./SessionQueue";
import { SessionSearch } from "./SessionSearch";
import { SessionUsers } from "./SessionUsers";

export default function SessionPage({
  params,
}: {
  params: Promise<{ id: string }>;
}) {
  const { id } = use(params);
  const { state, connectionStatus, error, sendCommand, discordUser, setDiscordUser } = useSession(id);

  const myRole = useMemo(() => {
    if (!state) return undefined;
    if (discordUser) return state.roles[discordUser.id] ?? "listener" as const;
    return state.roles["web"] ?? "listener" as const;
  }, [state, discordUser]);

  const connectDiscord = useCallback(() => {
    const clientId = process.env.NEXT_PUBLIC_DISCORD_CLIENT_ID;
    if (!clientId) return;
    const redirectUri = `${window.location.origin}/api/discord/callback`;
    const url = `https://discord.com/api/oauth2/authorize?client_id=${clientId}&redirect_uri=${encodeURIComponent(redirectUri)}&response_type=code&scope=identify`;
    const w = 500, h = 700;
    const left = screen.width / 2 - w / 2, top = screen.height / 2 - h / 2;
    window.open(url, "discord-oauth", `width=${w},height=${h},left=${left},top=${top}`);
    const handler = (e: MessageEvent) => {
      if (e.data?.type === "discord-auth" && e.data.user) {
        setDiscordUser(e.data.user);
        window.removeEventListener("message", handler);
      }
    };
    window.addEventListener("message", handler);
  }, [setDiscordUser]);

  const [copied, setCopied] = useState(false);

  /* ---- Loading ---- */
  if (connectionStatus === "connecting") {
    return (
      <div className="flex min-h-[60vh] items-center justify-center">
        <div className="flex flex-col items-center gap-4">
          <div className="h-10 w-10 animate-spin rounded-full border-4 border-[var(--border-subtle)] border-t-[var(--theme-accent)]" />
          <p className="text-sm" style={{ color: "var(--muted-foreground)" }}>
            Connecting to session…
          </p>
        </div>
      </div>
    );
  }

  /* ---- Disconnected / reconnecting (no state yet) ---- */
  if (connectionStatus !== "connected" && !state) {
    return (
      <div className="flex min-h-[60vh] items-center justify-center">
        <div className="flex flex-col items-center gap-4">
          <div className="h-10 w-10 animate-spin rounded-full border-4 border-[var(--border-subtle)] border-t-[var(--theme-accent)]" />
          <p className="text-sm" style={{ color: "var(--muted-foreground)" }}>
            {error ? `Retrying... (${error})` : "Connecting to session..."}
          </p>
        </div>
      </div>
    );
  }

  /* ---- Session ended ---- */
  if (error && !state) {
    return (
      <div className="flex min-h-[60vh] items-center justify-center px-4">
        <div className="rounded-xl border p-8 text-center max-w-md w-full" style={{ background: "var(--surface-1)", borderColor: "var(--border-subtle)" }}>
          <p className="text-lg font-semibold mb-2">Session unavailable</p>
          <p className="text-sm" style={{ color: "var(--muted-foreground)" }}>
            {error}
          </p>
          <button
            onClick={() => window.location.reload()}
            className="mt-6 rounded-lg px-5 py-2.5 text-sm font-medium transition-colors"
            style={{ background: "var(--theme-accent)", color: "var(--theme-accent-contrast)" }}
          >
            Retry
          </button>
        </div>
      </div>
    );
  }

  if (!state) return null;

  return (
    <div className="w-full h-full overflow-hidden flex flex-col gap-4 p-3 sm:p-5">
      {/* Header */}
      <header className="flex items-center gap-3 flex-shrink-0">
        <div className="min-w-0 flex-1">
          <h1 className="text-2xl sm:text-3xl font-bold truncate">
            {state.guildName !== "" ? state.guildName : "Session"}
          </h1>
          <p className="text-sm mt-0.5 flex flex-wrap items-center gap-x-1.5" style={{ color: "var(--muted-foreground)" }}>
            {state.guildName !== "" && (
              <>
                <span>Channel #{state.channelId}</span>
                <span className="mx-0.5">·</span>
              </>
            )}
            <span>
              {state.claimed
                ? `Created by ${state.createdBy.username}`
                : "Waiting for bot to claim..."}
            </span>
          </p>
        </div>

        {/* Right side: Discord badge + Session ID copy + Connection */}
        <div className="flex items-center gap-2 shrink-0">
          {discordUser ? (
            <div className="flex items-center gap-2 rounded-lg px-3 py-1.5 text-xs" style={{ background: "var(--surface-3)" }}>
              {discordUser.avatar && <img src={`https://cdn.discordapp.com/avatars/${discordUser.id}/${discordUser.avatar}.png`} alt="" className="h-5 w-5 rounded-full" />}
              <span className="font-medium">{discordUser.username}</span>
            </div>
          ) : (
            <button
              onClick={connectDiscord}
              className="flex items-center gap-2 rounded-lg px-3 py-1.5 text-xs font-medium transition-colors hover:bg-white/10"
              style={{ background: "var(--surface-3)", color: "var(--foreground)" }}
            >
              <svg width="14" height="14" viewBox="0 0 24 24" fill="currentColor"><path d="M20.317 4.37a19.791 19.791 0 0 0-4.885-1.515.074.074 0 0 0-.079.037c-.21.375-.444.864-.608 1.25a18.27 18.27 0 0 0-5.487 0 12.64 12.64 0 0 0-.617-1.25.077.077 0 0 0-.079-.037A19.736 19.736 0 0 0 3.677 4.37a.07.07 0 0 0-.032.027C.533 9.046-.32 13.58.099 18.057a.082.082 0 0 0 .031.057 19.9 19.9 0 0 0 5.993 3.03.078.078 0 0 0 .084-.028c.462-.63.874-1.295 1.226-1.994a.076.076 0 0 0-.041-.106 13.107 13.107 0 0 1-1.872-.892.077.077 0 0 1-.008-.128 10.2 10.2 0 0 0 .372-.292.074.074 0 0 1 .077-.01c3.928 1.793 8.18 1.793 12.062 0a.074.074 0 0 1 .078.01c.12.098.246.198.373.292a.077.077 0 0 1-.006.127 12.299 12.299 0 0 1-1.873.892.077.077 0 0 0-.041.107c.36.698.772 1.362 1.225 1.993a.076.076 0 0 0 .084.028 19.839 19.839 0 0 0 6.002-3.03.077.077 0 0 0 .032-.054c.5-5.177-.838-9.674-3.549-13.66a.061.061 0 0 0-.031-.03zM8.02 15.33c-1.183 0-2.157-1.085-2.157-2.419 0-1.333.956-2.419 2.157-2.419 1.21 0 2.176 1.095 2.157 2.42 0 1.333-.956 2.418-2.157 2.418zm7.975 0c-1.183 0-2.157-1.085-2.157-2.419 0-1.333.955-2.419 2.157-2.419 1.21 0 2.176 1.095 2.157 2.42 0 1.333-.946 2.418-2.157 2.418z"/></svg>
              Connect Discord
            </button>
          )}
          {/* Session ID copy — behind Discord badge */}
          <button
            onClick={() => { navigator.clipboard.writeText(id); setCopied(true); setTimeout(() => setCopied(false), 2000); }}
            className="flex items-center gap-1.5 rounded-lg px-3 py-1.5 text-xs font-mono transition-colors hover:bg-white/[0.06]"
            style={{ background: "var(--surface-3)", color: "var(--muted-foreground)" }}
          >
            <span className="truncate max-w-[120px]">{id.slice(0, 8)}</span>
            <span style={{ color: copied ? "#22c55e" : "var(--muted-foreground)" }}>
              {copied ? "Copied" : "Copy"}
            </span>
          </button>
          <span
            className="inline-block h-2 w-2 rounded-full"
            style={{ background: connectionStatus === "connected" ? "#22c55e" : "#f59e0b" }}
          />
          <span className="text-xs capitalize" style={{ color: "var(--muted-foreground)" }}>
            {connectionStatus}
          </span>
        </div>
      </header>

      {/* Error banner (if connected but got an error) */}
      {error && state && (
        <div
          className="rounded-lg border px-4 py-3 text-sm"
          style={{ background: "rgba(239,68,68,0.1)", borderColor: "rgba(239,68,68,0.3)", color: "#fca5a5" }}
        >
          {error}
        </div>
      )}

      {/* Main grid */}
      <div className="grid grid-cols-1 lg:grid-cols-3 gap-4 flex-1 min-h-0">
        {/* Left: Player + Search */}
        <div className="lg:col-span-2 flex flex-col gap-4 min-h-0">
          <SessionPlayer state={state} role={myRole} sendCommand={sendCommand} />
          <SessionSearch sendCommand={sendCommand} />
        </div>

        {/* Right: Queue + Users */}
        <div className="flex flex-col gap-4 min-h-0">
          <SessionQueue state={state} role={myRole} sendCommand={sendCommand} />
          <SessionUsers state={state} discordUser={discordUser} />
        </div>
      </div>
    </div>
  );
}
