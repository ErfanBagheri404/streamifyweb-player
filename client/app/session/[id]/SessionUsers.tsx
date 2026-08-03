"use client";

import type { SessionState } from "./types";

const ROLE_STYLES: Record<string, { bg: string; color: string; label: string }> = {
  admin: { bg: "rgba(239,68,68,0.15)", color: "#fca5a5", label: "Admin" },
  dj: { bg: "rgba(168,85,247,0.15)", color: "#d8b4fe", label: "DJ" },
  listener: { bg: "var(--surface-3)", color: "var(--muted-foreground)", label: "Listener" },
};

interface SessionUsersProps {
  state: SessionState;
  discordUser?: import("./types").DiscordUser | null;
}

function getAvatarUrl(userId: string, avatar: string | null | undefined): string | null {
  if (!avatar) return null;
  // Discord avatars can be just the hash or a full URL
  if (avatar.startsWith("http")) return avatar;
  return `https://cdn.discordapp.com/avatars/${userId}/${avatar}.png?size=64`;
}

export function SessionUsers({ state, discordUser }: SessionUsersProps) {
  const { roles, userNames, userAvatars, createdBy } = state;
  const entries = Object.entries(roles);

  // Determine the current user's role
  const myRole = discordUser ? (roles[discordUser.id] ?? "listener") : "listener";
  const myStyle = ROLE_STYLES[myRole] ?? ROLE_STYLES.listener;

  return (
    <div className="rounded-xl border p-5 sm:p-6" style={{ background: "var(--surface-1)", borderColor: "var(--border-subtle)" }}>
      <div className="flex items-center justify-between mb-4">
        <h3 className="text-base font-semibold">Connected Users</h3>
        <span className="text-xs px-2 py-0.5 rounded-full" style={{ background: "var(--surface-3)", color: "var(--muted-foreground)" }}>
          {entries.length}
        </span>
      </div>

      {entries.length === 0 ? (
        <p className="text-sm text-center py-6" style={{ color: "var(--muted-foreground)" }}>
          No users connected yet.
        </p>
      ) : (
        <ul className="space-y-1 max-h-[280px] overflow-y-auto hide-scrollbar">
          {entries.map(([userId, role]) => {
            const style = ROLE_STYLES[role] ?? ROLE_STYLES.listener;
            const isCreator = createdBy.id === userId;
            const displayName = userNames?.[userId] || createdBy.username || userId;
            const avatarUrl = getAvatarUrl(userId, userAvatars?.[userId]);

            return (
              <li
                key={userId}
                className="flex items-center gap-3 rounded-xl px-3 py-2.5 transition-colors hover:bg-white/[0.04]"
              >
                {/* Avatar */}
                {avatarUrl ? (
                  <img
                    src={avatarUrl}
                    alt=""
                    className="h-8 w-8 flex-shrink-0 rounded-full object-cover"
                    referrerPolicy="no-referrer"
                    onError={(e) => {
                      // Fallback to initial letter on error
                      e.currentTarget.style.display = "none";
                      const fallback = e.currentTarget.nextElementSibling as HTMLElement;
                      if (fallback) fallback.style.display = "flex";
                    }}
                  />
                ) : null}
                <div
                  className="flex h-8 w-8 flex-shrink-0 items-center justify-center rounded-full text-xs font-bold"
                  style={{
                    background: style.bg,
                    color: style.color,
                    display: avatarUrl ? "none" : "flex",
                  }}
                >
                  {displayName.charAt(0).toUpperCase()}
                </div>

                {/* Name */}
                <div className="min-w-0 flex-1">
                  <p className="text-sm font-medium truncate">
                    {displayName}
                    {isCreator && (
                      <span className="ml-1.5 text-[10px] font-normal" style={{ color: "var(--muted-foreground)" }}>
                        (creator)
                      </span>
                    )}
                  </p>
                </div>

                {/* Role badge */}
                <span
                  className="flex-shrink-0 rounded-full px-2 py-0.5 text-[11px] font-medium"
                  style={{ background: style.bg, color: style.color }}
                >
                  {style.label}
                </span>
              </li>
            );
          })}
        </ul>
      )}

      {/* Your role indicator */}
      <div
        className="mt-3 rounded-xl px-3 py-2 text-xs"
        style={{ background: "var(--surface-3)", color: "var(--muted-foreground)" }}
      >
        Your role: <span className="font-medium" style={{ color: myStyle.color }}>{myStyle.label}</span>
        {!discordUser && (
          <span className="ml-1">(connect Discord to identify)</span>
        )}
      </div>
    </div>
  );
}
