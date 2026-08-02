"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import type { DiscordUser, SessionState, WSMessage } from "./types";

export type ConnectionStatus = "connecting" | "connected" | "disconnected" | "error";

export interface UseSessionReturn {
  state: SessionState | null;
  connectionStatus: ConnectionStatus;
  error: string | null;
  sendCommand: (type: string, payload?: Record<string, unknown>) => void;
  discordUser: DiscordUser | null;
  setDiscordUser: (user: DiscordUser | null) => void;
}

/**
 * Connects to the CF Worker WebSocket for a given session.
 * Auto-reconnects with exponential backoff on disconnect.
 */
export function useSession(sessionId: string): UseSessionReturn {
  const [state, setState] = useState<SessionState | null>(null);
  const [connectionStatus, setConnectionStatus] = useState<ConnectionStatus>("connecting");
  const [error, setError] = useState<string | null>(null);
  const [discordUser, setDiscordUserState] = useState<DiscordUser | null>(() => {
    if (typeof window === "undefined") return null;
    try {
      const stored = localStorage.getItem("streamify-discord-user");
      return stored ? JSON.parse(stored) : null;
    } catch {
      return null;
    }
  });
  const wsRef = useRef<WebSocket | null>(null);
  const reconnectTimeoutRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const attemptRef = useRef(0);
  const mountedRef = useRef(true);
  const discordUserRef = useRef<DiscordUser | null>(discordUser);

  // Keep ref in sync with state
  useEffect(() => {
    discordUserRef.current = discordUser;
  }, [discordUser]);

  const setDiscordUser = useCallback((user: DiscordUser | null) => {
    setDiscordUserState(user);
    if (typeof window === "undefined") return;
    if (user) {
      localStorage.setItem("streamify-discord-user", JSON.stringify(user));
    } else {
      localStorage.removeItem("streamify-discord-user");
    }
  }, []);

  const baseUrl = process.env.NEXT_PUBLIC_SESSION_URL ?? "";

  // Use a ref to hold the latest connect function so the onclose callback
  // can call it without the lint-immutability rule triggering.
  const connectRef = useRef<() => void>(() => {});

  const doConnect = useCallback(() => {
    if (!mountedRef.current) return;

    const wsUrl = `${baseUrl}/session/${encodeURIComponent(sessionId)}/ws`;

    // Clean up any existing socket first
    if (wsRef.current) {
      wsRef.current.onclose = null;
      wsRef.current.close();
      wsRef.current = null;
    }

    setConnectionStatus("connecting");

    const ws = new WebSocket(wsUrl);
    wsRef.current = ws;

    ws.onopen = () => {
      if (!mountedRef.current) return;
      attemptRef.current = 0;
      setConnectionStatus("connected");
      setError(null);
    };

    ws.onmessage = (event) => {
      if (!mountedRef.current) return;
      try {
        const msg: WSMessage = JSON.parse(event.data as string);
        switch (msg.type) {
          case "state":
            setState(msg.state);
            break;
          case "command-ack":
            break;
          case "session-ended":
            setState(null);
            setError("This session has ended.");
            setConnectionStatus("disconnected");
            ws.close();
            break;
          case "error":
            setError(msg.message);
            break;
        }
      } catch {
        // malformed message — ignore
      }
    };

    ws.onerror = () => {
      if (!mountedRef.current) return;
      setConnectionStatus("error");
      setError("WebSocket connection error.");
    };

    ws.onclose = () => {
      if (!mountedRef.current) return;
      wsRef.current = null;
      setConnectionStatus("disconnected");

      // Auto-reconnect with exponential backoff
      const attempt = attemptRef.current;
      const delay = Math.min(1000 * 2 ** attempt, 30_000);
      attemptRef.current = attempt + 1;

      reconnectTimeoutRef.current = setTimeout(() => {
        connectRef.current();
      }, delay);
    };
  }, [baseUrl, sessionId]);

  // Sync ref with latest callback so the onclose handler can call it
  useEffect(() => {
    connectRef.current = doConnect;
  }, [doConnect]);

  useEffect(() => {
    mountedRef.current = true;
    doConnect();

    return () => {
      mountedRef.current = false;
      if (reconnectTimeoutRef.current) clearTimeout(reconnectTimeoutRef.current);
      if (wsRef.current) {
        wsRef.current.onclose = null;
        wsRef.current.close();
      }
    };
  }, [doConnect]);

  const sendCommand = useCallback(
    (type: string, payload: Record<string, unknown> = {}) => {
      const ws = wsRef.current;
      if (!ws || ws.readyState !== WebSocket.OPEN) return;
      ws.send(
        JSON.stringify({
          type,
          payload: {
            ...payload,
            discordUser: discordUserRef.current,
          },
        })
      );
    },
    []
  );

  return { state, connectionStatus, error, sendCommand, discordUser, setDiscordUser };
}
