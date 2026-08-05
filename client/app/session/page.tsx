"use client";

import { useState, useEffect, useCallback } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import type { DiscordUser } from "../session/[id]/types";
import { useAppLanguage } from "../hooks/useAppLanguage";

const SESSION_URL = process.env.NEXT_PUBLIC_SESSION_URL ?? "";
const DISCORD_CLIENT_ID = process.env.NEXT_PUBLIC_DISCORD_CLIENT_ID ?? "1532405105104654452";
const STORAGE_KEY = "streamify-discord-user";
const BOT_INVITE = "https://discord.com/oauth2/authorize?client_id=1532405105104654452&permissions=2184252416&integration_type=0&scope=bot+applications.commands";

function getDiscordAuthUrl() {
  const origin = typeof window !== "undefined" ? window.location.origin : "http://localhost:3000";
  const redirect = encodeURIComponent(`${origin}/api/discord/callback`);
  return `https://discord.com/api/oauth2/authorize?client_id=${DISCORD_CLIENT_ID}&response_type=code&redirect_uri=${redirect}&scope=identify`;
}

export default function SessionsPage() {
  const router = useRouter();
  const { t } = useAppLanguage();
  const [discordUser, setDiscordUser] = useState<DiscordUser | null>(null);
  const [loadingAuth, setLoadingAuth] = useState(true);
  const [sessionId, setSessionId] = useState("");
  const [creating, setCreating] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [recentSessions, setRecentSessions] = useState<string[]>([]);
  const [guideSessionId, setGuideSessionId] = useState<string | null>(null);
  const [copied, setCopied] = useState(false);

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
    const w = 500, h = 700;
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
        fetch(`${SESSION_URL}/session/create-pending`, {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ sessionId: id }),
        }).catch(() => {});
      }
      saveRecent(id);
      setGuideSessionId(id);
    } catch (e: any) {
      setError(e.message || "Failed");
    } finally {
      setCreating(false);
    }
  };

  const copySessionId = async () => {
    if (!guideSessionId) return;
    try {
      await navigator.clipboard.writeText(guideSessionId);
      setCopied(true);
      setTimeout(() => setCopied(false), 2000);
    } catch {}
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
    <div className="flex h-full min-h-0 flex-col overflow-hidden" style={{ background: "var(--background)", color: "var(--foreground)" }}>
      {/* Header */}
      <div className="mb-4 flex items-center gap-3">
        <div className="flex h-9 w-9 items-center justify-center rounded-xl flex-shrink-0" style={{ background: "var(--surface-3)" }}>
          <svg viewBox="0 0 24 24" fill="currentColor" className="h-5 w-5" style={{ color: "var(--foreground)" }}>
            <path d="M20.317 4.37a19.791 19.791 0 0 0-4.885-1.515.074.074 0 0 0-.079.037c-.21.375-.444.864-.608 1.25a18.27 18.27 0 0 0-5.487 0 12.64 12.64 0 0 0-.617-1.25.077.077 0 0 0-.079-.037A19.736 19.736 0 0 0 3.677 4.37a.07.07 0 0 0-.032.027C.533 9.046-.32 13.58.099 18.057a.082.082 0 0 0 .031.057 19.9 19.9 0 0 0 5.993 3.03.078.078 0 0 0 .084-.028c.462-.63.874-1.295 1.226-1.994a.076.076 0 0 0-.041-.106 13.107 13.107 0 0 1-1.872-.892.077.077 0 0 1-.008-.128 10.2 10.2 0 0 0 .372-.292.074.074 0 0 1 .077-.01c3.928 1.793 8.18 1.793 12.062 0a.074.074 0 0 1 .078.01c.12.098.246.198.373.292a.077.077 0 0 1-.006.127 12.299 12.299 0 0 1-1.873.892.077.077 0 0 0-.041.107c.36.698.772 1.362 1.225 1.993a.076.076 0 0 0 .084.028 19.839 19.839 0 0 0 6.002-3.03.077.077 0 0 0 .032-.054c.5-5.177-.838-9.674-3.549-13.66a.061.061 0 0 0-.031-.03zM8.02 15.33c-1.183 0-2.157-1.085-2.157-2.419 0-1.333.956-2.419 2.157-2.419 1.21 0 2.176 1.095 2.157 2.42 0 1.333-.956 2.418-2.157-2.418zm7.975 0c-1.183 0-2.157-1.085-2.157-2.419 0-1.333.955-2.419 2.157-2.419 1.21 0 2.176 1.095 2.157 2.42 0 1.333-.946 2.418-2.157-2.418z" />
          </svg>
        </div>
        <div className="min-w-0 flex-1">
          <h1 className="text-lg font-bold leading-tight">{t("session.title")}</h1>
        </div>
        <a
          href={BOT_INVITE}
          target="_blank"
          rel="noopener noreferrer"
          className="flex items-center gap-1.5 rounded-lg px-3 py-1.5 text-xs font-medium transition-colors hover:opacity-80"
          style={{ background: "var(--theme-accent)", color: "var(--theme-accent-contrast)" }}
        >
          <svg width="14" height="14" viewBox="0 0 24 24" fill="currentColor">
            <path d="M12 2C6.48 2 2 6.48 2 12s4.48 10 10 10 10-4.48 10-10S17.52 2 12 2zm-1 14H9V8h2v8zm4 0h-2V8h2v8z"/>
          </svg>
          {t("session.addBot")}
        </a>
        {discordUser && (
          <div className="flex items-center gap-2">
            <div className="flex items-center gap-2 rounded-lg px-3 py-1.5 text-xs" style={{ background: "var(--surface-3)" }}>
              {discordUser.avatar && (
                <img src={`https://cdn.discordapp.com/avatars/${discordUser.id}/${discordUser.avatar}.png?size=64`} alt="" className="h-5 w-5 rounded-full" />
              )}
              <span className="font-medium">{discordUser.username}</span>
            </div>
            <button onClick={disconnectDiscord} className="text-xs px-2 py-1 rounded-lg transition-colors hover:opacity-80" style={{ color: "var(--muted-foreground)" }}>
              {t("session.disconnect")}
            </button>
          </div>
        )}
      </div>

      {/* Content */}
      {notConnected ? (
        <div className="flex flex-1 items-center justify-center">
          <div className="flex flex-col items-center gap-5 rounded-2xl border p-8 sm:p-10 text-center max-w-sm" style={{ background: "var(--surface-1)", borderColor: "var(--border-subtle)" }}>
            <div className="flex h-14 w-14 items-center justify-center rounded-2xl" style={{ background: "var(--surface-3)" }}>
              <svg viewBox="0 0 24 24" fill="currentColor" className="h-8 w-8" style={{ color: "#5865F2" }}>
                <path d="M20.317 4.37a19.791 19.791 0 0 0-4.885-1.515.074.074 0 0 0-.079.037c-.21.375-.444.864-.608 1.25a18.27 18.27 0 0 0-5.487 0 12.64 12.64 0 0 0-.617-1.25.077.077 0 0 0-.079-.037A19.736 19.736 0 0 0 3.677 4.37a.07.07 0 0 0-.032.027C.533 9.046-.32 13.58.099 18.057a.082.082 0 0 0 .031.057 19.9 19.9 0 0 0 5.993 3.03.078.078 0 0 0 .084-.028c.462-.63.874-1.295 1.226-1.994a.076.076 0 0 0-.041-.106 13.107 13.107 0 0 1-1.872-.892.077.077 0 0 1-.008-.128 10.2 10.2 0 0 0 .372-.292.074.074 0 0 1 .077-.01c3.928 1.793 8.18 1.793 12.062 0a.074.074 0 0 1 .078.01c.12.098.246.198.373.292a.077.077 0 0 1-.006.127 12.299 12.299 0 0 1-1.873.892.077.077 0 0 0-.041.107c.36.698.772 1.362 1.225 1.993a.076.076 0 0 0 .084.028 19.839 19.839 0 0 0 6.002-3.03.077.077 0 0 0 .032-.054c.5-5.177-.838-9.674-3.549-13.66a.061.061 0 0 0-.031-.03zM8.02 15.33c-1.183 0-2.157-1.085-2.157-2.419 0-1.333.956-2.419 2.157-2.419 1.21 0 2.176 1.095 2.157 2.42 0 1.333-.956 2.418-2.157-2.418zm7.975 0c-1.183 0-2.157-1.085-2.157-2.419 0-1.333.955-2.419 2.157-2.419 1.21 0 2.176 1.095 2.157 2.42 0 1.333-.946 2.418-2.157-2.418z" />
              </svg>
            </div>
            <div>
              <button onClick={connectDiscord} className="w-full rounded-xl px-4 py-2.5 text-sm font-semibold transition-all hover:scale-[1.02] active:scale-[0.98]" style={{ background: "#5865F2", color: "#fff" }}>
                {t("session.connectDiscord")}
              </button>
              <p className="mt-3 text-xs leading-relaxed" style={{ color: "var(--muted-foreground)" }}>
                {t("session.connectPrompt")}
              </p>
            </div>
          </div>
        </div>
      ) : (
        <div className="flex min-h-0 flex-1 flex-col gap-3 sm:flex-row">
          {/* Create Session */}
          <div className="flex flex-1 flex-col justify-between rounded-2xl border p-5" style={{ background: "var(--surface-1)", borderColor: "var(--border-subtle)" }}>
            <div>
              <div className="flex items-center gap-2.5 mb-3">
                <div className="flex h-8 w-8 items-center justify-center rounded-lg" style={{ background: "var(--surface-3)" }}>
                  <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" style={{ color: "var(--foreground)" }}>
                    <path d="M12 5v14M5 12h14"/>
                  </svg>
                </div>
                <h2 className="text-sm font-semibold">{t("session.createSession")}</h2>
              </div>

              <div className="flex flex-col gap-3">
              <div className="flex gap-3">
                <div className="flex h-6 w-6 flex-shrink-0 items-center justify-center rounded-full text-[10px] font-bold" style={{ background: "var(--foreground)", color: "var(--background)" }}>1</div>
                <div className="flex-1 text-xs leading-relaxed" style={{ color: "var(--muted-foreground)" }}>
                  <span className="font-medium" style={{ color: "var(--foreground)" }}>{t("session.createStep1Title")}</span>
                  <span className="block mt-0.5">{t("session.createStep1Desc")}</span>
                </div>
              </div>
              <div className="flex gap-3">
                <div className="flex h-6 w-6 flex-shrink-0 items-center justify-center rounded-full text-[10px] font-bold" style={{ background: "var(--foreground)", color: "var(--background)" }}>2</div>
                <div className="flex-1 text-xs leading-relaxed" style={{ color: "var(--muted-foreground)" }}>
                  <span className="font-medium" style={{ color: "var(--foreground)" }}>{t("session.createStep2Title")}</span>
                  <span className="block mt-0.5">{t("session.createStep2Desc")}</span>
                </div>
              </div>
              <div className="flex gap-3">
                <div className="flex h-6 w-6 flex-shrink-0 items-center justify-center rounded-full text-[10px] font-bold" style={{ background: "var(--foreground)", color: "var(--background)" }}>3</div>
                <div className="flex-1 text-xs leading-relaxed" style={{ color: "var(--muted-foreground)" }}>
                  <span className="font-medium" style={{ color: "var(--foreground)" }}>{t("session.createStep3Title")}</span>
                  <span className="block mt-0.5">{t("session.createStep3Desc")}</span>
                </div>
              </div>
              </div>
            </div>

            <button onClick={handleCreate} disabled={creating} className="w-full rounded-xl px-4 py-2.5 text-sm font-semibold transition-all hover:scale-[1.02] active:scale-[0.98] disabled:opacity-40" style={{ background: "var(--foreground)", color: "var(--background)" }}>
              {creating ? t("common.loading") : t("session.createAndLink")}
            </button>
          </div>

          {/* Join Session */}
          <div className="flex flex-1 flex-col justify-between rounded-2xl border p-5" style={{ background: "var(--surface-1)", borderColor: "var(--border-subtle)" }}>
            <div>
              <div className="flex items-center gap-2.5 mb-3">
                <div className="flex h-8 w-8 items-center justify-center rounded-lg" style={{ background: "var(--surface-3)" }}>
                  <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" style={{ color: "var(--foreground)" }}>
                    <path d="M15 3h4a2 2 0 012 2v14a2 2 0 01-2 2h-4M10 17l5-5-5-5M15 12H3"/>
                  </svg>
                </div>
                <h2 className="text-sm font-semibold">{t("session.joinSession")}</h2>
              </div>

              <div className="flex flex-col gap-3">
              <div className="flex gap-3">
                <div className="flex h-6 w-6 flex-shrink-0 items-center justify-center rounded-full text-[10px] font-bold" style={{ background: "var(--foreground)", color: "var(--background)" }}>1</div>
                <div className="flex-1 text-xs leading-relaxed" style={{ color: "var(--muted-foreground)" }}>
                  <span className="font-medium" style={{ color: "var(--foreground)" }}>{t("session.joinStep1Title")}</span>
                  <span className="block mt-0.5">{t("session.joinStep1Desc")}</span>
                </div>
              </div>
              <div className="flex gap-3">
                <div className="flex h-6 w-6 flex-shrink-0 items-center justify-center rounded-full text-[10px] font-bold" style={{ background: "var(--foreground)", color: "var(--background)" }}>2</div>
                <div className="flex-1 text-xs leading-relaxed" style={{ color: "var(--muted-foreground)" }}>
                  <span className="font-medium" style={{ color: "var(--foreground)" }}>{t("session.joinStep2Title")}</span>
                  <span className="block mt-0.5">{t("session.joinStep2Desc")}</span>
                </div>
              </div>
              <div className="flex gap-3">
                <div className="flex h-6 w-6 flex-shrink-0 items-center justify-center rounded-full text-[10px] font-bold" style={{ background: "var(--foreground)", color: "var(--background)" }}>3</div>
                <div className="flex-1 text-xs leading-relaxed" style={{ color: "var(--muted-foreground)" }}>
                  <span className="font-medium" style={{ color: "var(--foreground)" }}>{t("session.joinStep3Title")}</span>
                  <span className="block mt-0.5">{t("session.joinStep3Desc")}</span>
                </div>
              </div>
              </div>
            </div>

            <form onSubmit={handleJoin} className="flex gap-2">
              <input value={sessionId} onChange={(e) => setSessionId(e.target.value)} placeholder={t("session.sessionId")} className="min-w-0 flex-1 rounded-xl border px-3 py-2.5 text-xs font-mono outline-none transition placeholder:opacity-30 focus:ring-1 focus:ring-[var(--theme-accent)]" style={{ background: "var(--surface-3)", borderColor: "var(--border-subtle)", color: "var(--foreground)" }} />
              <button type="submit" disabled={!sessionId.trim()} className="shrink-0 rounded-xl px-4 py-2.5 text-xs font-semibold transition-all hover:scale-[1.02] active:scale-[0.98] disabled:opacity-30" style={{ background: "var(--surface-3)", color: "var(--foreground)" }}>
                {t("session.join")}
              </button>
            </form>
          </div>

          {/* Recent */}
          {recentSessions.length > 0 && (
            <div className="flex flex-col rounded-2xl border p-5" style={{ background: "var(--surface-1)", borderColor: "var(--border-subtle)" }}>
              <div className="flex items-center gap-2.5 mb-3">
                <div className="flex h-8 w-8 items-center justify-center rounded-lg" style={{ background: "var(--surface-3)" }}>
                  <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" style={{ color: "var(--foreground)" }}>
                    <circle cx="12" cy="12" r="10"/><polyline points="12,6 12,12 16,14"/>
                  </svg>
                </div>
                <h2 className="text-sm font-semibold">{t("session.recent")}</h2>
              </div>
              <div className="flex flex-col gap-1.5">
                {recentSessions.map((id) => (
                  <Link key={id} href={`/session/${id}`} className="group flex items-center justify-between rounded-lg px-3 py-2 text-xs font-mono" style={{ background: "var(--surface-3)" }}>
                    <span className="opacity-70 truncate group-hover:opacity-100 transition-opacity">{id}</span>
                    <span className="opacity-20 flex-shrink-0 ml-2 group-hover:opacity-50 transition-opacity">{"\u2192"}</span>
                  </Link>
                ))}
              </div>
            </div>
          )}
        </div>
      )}

      {error && (
        <div className="mt-3 rounded-xl border px-4 py-2.5 text-xs" style={{ background: "rgba(239,68,68,0.08)", borderColor: "rgba(239,68,68,0.2)", color: "#f87171" }}>
          {error}
        </div>
      )}

      {!SESSION_URL && (
        <p className="mt-2 text-center text-[10px]" style={{ color: "color-mix(in srgb, var(--foreground) 25%, transparent)" }}>
          {t("session.noSessionUrl")}
        </p>
      )}

      {/* Footer */}
      <div className="mt-auto pt-2.5 flex items-center justify-center gap-4 text-[10px]" style={{ color: "color-mix(in srgb, var(--foreground) 30%, transparent)" }}>
        <Link href="/session/terms" className="hover:opacity-80 transition-opacity">Terms of Service</Link>
        <span>·</span>
        <Link href="/session/privacy" className="hover:opacity-80 transition-opacity">Privacy Policy</Link>
      </div>

      {/* Guide Modal */}
      {guideSessionId && (
        <div className="fixed inset-0 z-50 flex items-center justify-center" style={{ background: "rgba(0,0,0,0.6)", backdropFilter: "blur(4px)" }} onClick={() => { setGuideSessionId(null); setCopied(false); }}>
          <div className="w-full max-w-md rounded-2xl border p-6 sm:p-8 session-guide-enter" style={{ background: "var(--surface-1)", borderColor: "var(--border-subtle)" }} onClick={(e) => e.stopPropagation()}>
            <h2 className="text-base font-semibold mb-4">{t("session.guideTitle")}</h2>

            <div className="flex flex-col gap-4">
              <div className="flex gap-3">
                <div className="flex h-7 w-7 flex-shrink-0 items-center justify-center rounded-full text-xs font-bold" style={{ background: "var(--foreground)", color: "var(--background)" }}>1</div>
                <div className="flex-1 min-w-0">
                  <p className="text-sm font-medium mb-1.5">{t("session.guideStep1")}</p>
                  <div className="flex gap-2">
                    <div className="flex-1 min-w-0 rounded-lg border px-3 py-2 font-mono text-xs truncate" style={{ background: "var(--surface-3)", borderColor: "var(--border-subtle)" }}>
                      {guideSessionId}
                    </div>
                    <button onClick={copySessionId} className="shrink-0 rounded-lg px-3 py-2 text-xs font-medium transition-all hover:scale-105 active:scale-95" style={{ background: copied ? "rgba(34,197,94,0.15)" : "var(--surface-3)", color: copied ? "#22c55e" : "var(--foreground)" }}>
                      {copied ? "Copied" : "Copy"}
                    </button>
                  </div>
                </div>
              </div>

              <div className="flex gap-3">
                <div className="flex h-7 w-7 flex-shrink-0 items-center justify-center rounded-full text-xs font-bold" style={{ background: "var(--foreground)", color: "var(--background)" }}>2</div>
                <div className="flex-1 min-w-0">
                  <p className="text-sm font-medium mb-1.5">{t("session.guideStep2")}</p>
                  <div className="rounded-lg border px-3 py-2 text-xs" style={{ background: "var(--surface-3)", borderColor: "var(--border-subtle)" }}>
                    <span style={{ color: "var(--muted-foreground)" }}>{t("session.guideLinkCmd")}</span>
                    <span className="font-mono font-medium">/session link </span>
                    <span className="font-mono" style={{ color: "#5865F2" }}>[paste id]</span>
                  </div>
                </div>
              </div>

              <div className="flex gap-3">
                <div className="flex h-7 w-7 flex-shrink-0 items-center justify-center rounded-full text-xs font-bold" style={{ background: "var(--foreground)", color: "var(--background)" }}>3</div>
                <div className="flex-1">
                  <p className="text-sm font-medium mb-1.5">{t("session.guideStep3")}</p>
                  <p className="text-xs" style={{ color: "var(--muted-foreground)" }}>{t("session.guideStep3Desc")}</p>
                </div>
              </div>
            </div>

            <div className="flex gap-2 mt-6">
              <button onClick={() => { router.push(`/session/${guideSessionId}`); setGuideSessionId(null); }} className="flex-1 rounded-xl px-4 py-2.5 text-sm font-semibold transition-all hover:scale-[1.02] active:scale-[0.98]" style={{ background: "var(--foreground)", color: "var(--background)" }}>
                {t("session.openSession")}
              </button>
              <button onClick={() => { setGuideSessionId(null); setCopied(false); }} className="rounded-xl px-4 py-2.5 text-sm font-medium transition-all hover:scale-[1.02] active:scale-[0.98]" style={{ background: "var(--surface-3)", color: "var(--muted-foreground)" }}>
                {t("session.close")}
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
