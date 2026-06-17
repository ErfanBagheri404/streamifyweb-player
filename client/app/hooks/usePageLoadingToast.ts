"use client";

import { useEffect } from "react";
import { useToast } from "../contexts/ToastContext";

export function usePageLoadingToast(options: {
  enabled?: boolean;
  isLoading: boolean;
  message: string;
}) {
  const { enabled = true, isLoading, message } = options;
  const { dismissToast, showToast } = useToast();

  useEffect(() => {
    if (!enabled) {
      dismissToast("page-load");
      return;
    }

    if (isLoading) {
      showToast({
        message,
        tone: "loading",
        durationMs: 0,
        source: "page-load",
      });
      return;
    }

    dismissToast("page-load");
  }, [dismissToast, enabled, isLoading, message, showToast]);

  useEffect(() => {
    return () => {
      dismissToast("page-load");
    };
  }, [dismissToast]);
}
