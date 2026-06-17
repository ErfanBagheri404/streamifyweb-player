"use client";

import {
  createContext,
  useCallback,
  useContext,
  useEffect,
  useMemo,
  useState,
} from "react";
import { usePathname } from "next/navigation";
import { useAppLanguage } from "../hooks/useAppLanguage";

type ToastTone = "info" | "success" | "error" | "loading";
type ToastSource = "default" | "navigation" | "page-load";

type ToastOptions = {
  message: string;
  tone?: ToastTone;
  durationMs?: number;
  actionLabel?: string;
  onAction?: () => void;
  source?: ToastSource;
};

type ToastRecord = ToastOptions & {
  id: number;
  tone: ToastTone;
  durationMs: number;
  source: ToastSource;
};

type ToastContextValue = {
  showToast: (options: ToastOptions) => void;
  showNavigationToast: (destination?: string) => void;
  dismissToast: (source?: ToastSource) => void;
};

const ToastContext = createContext<ToastContextValue | null>(null);

function isInternalNavigationTarget(
  anchor: HTMLAnchorElement,
  pathname: string
): boolean {
  if (typeof window === "undefined") return false;
  if (
    !anchor.href ||
    anchor.target === "_blank" ||
    anchor.hasAttribute("download")
  ) {
    return false;
  }

  const nextUrl = new URL(anchor.href, window.location.href);
  if (nextUrl.origin !== window.location.origin) return false;
  if (nextUrl.hash && nextUrl.pathname === pathname && !nextUrl.search)
    return false;

  return nextUrl.pathname !== pathname;
}

function ToastGlyph({ tone }: { tone: ToastTone }) {
  if (tone === "loading") {
    return (
      <span
        className="inline-flex h-4 w-4 animate-spin rounded-full border-2 border-[color:color-mix(in_srgb,var(--foreground)_70%,transparent)] border-t-transparent"
        aria-hidden="true"
      />
    );
  }

  if (tone === "success") {
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
        <path
          strokeLinecap="round"
          strokeLinejoin="round"
          d="m5 12 4 4 10-10"
        />
      </svg>
    );
  }

  if (tone === "error") {
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
        <path strokeLinecap="round" d="m7 7 10 10M17 7 7 17" />
      </svg>
    );
  }

  return null;
}

export function ToastProvider({ children }: { children: React.ReactNode }) {
  const { t } = useAppLanguage();
  const pathname = usePathname();
  const [toast, setToast] = useState<ToastRecord | null>(null);

  const dismissToast = useCallback((source?: ToastSource) => {
    setToast((current) => {
      if (!current) return null;
      if (source && current.source !== source) {
        return current;
      }
      return null;
    });
  }, []);

  const showToast = useCallback((options: ToastOptions) => {
    setToast({
      id: Date.now() + Math.random(),
      tone: options.tone || "info",
      durationMs:
        typeof options.durationMs === "number"
          ? options.durationMs
          : options.tone === "loading"
          ? 0
          : 2600,
      source: options.source || "default",
      ...options,
    });
  }, []);

  const showNavigationToast = useCallback(
    (destination?: string) => {
      if (typeof window !== "undefined" && destination) {
        const nextUrl = new URL(destination, window.location.href);
        if (
          nextUrl.origin !== window.location.origin ||
          nextUrl.pathname === window.location.pathname
        ) {
          return;
        }
      }

      showToast({
        message: t("common.loading"),
        tone: "loading",
        durationMs: 0,
        source: "navigation",
      });
    },
    [showToast, t]
  );

  useEffect(() => {
    if (!toast || toast.durationMs <= 0) return;

    const timer = window.setTimeout(() => {
      setToast((current) => (current?.id === toast.id ? null : current));
    }, toast.durationMs);

    return () => {
      window.clearTimeout(timer);
    };
  }, [toast]);

  useEffect(() => {
    if (toast?.source !== "navigation") return;

    const timer = window.setTimeout(() => {
      setToast((current) =>
        current?.source === "navigation" ? null : current
      );
    }, 450);

    return () => {
      window.clearTimeout(timer);
    };
  }, [pathname, toast?.id, toast?.source]);

  useEffect(() => {
    const handleDocumentClick = (event: MouseEvent) => {
      if (
        event.defaultPrevented ||
        event.button !== 0 ||
        event.metaKey ||
        event.ctrlKey ||
        event.shiftKey ||
        event.altKey
      ) {
        return;
      }

      const target = event.target;
      if (!(target instanceof Element)) return;

      const anchor = target.closest("a[href]");
      if (!(anchor instanceof HTMLAnchorElement)) return;
      if (!isInternalNavigationTarget(anchor, pathname)) return;

      showNavigationToast(anchor.href);
    };

    const handleDocumentPointerDown = (event: PointerEvent) => {
      if (
        event.defaultPrevented ||
        event.button !== 0 ||
        event.metaKey ||
        event.ctrlKey ||
        event.shiftKey ||
        event.altKey
      ) {
        return;
      }

      const target = event.target;
      if (!(target instanceof Element)) return;

      const anchor = target.closest("a[href]");
      if (!(anchor instanceof HTMLAnchorElement)) return;
      if (!isInternalNavigationTarget(anchor, pathname)) return;

      showNavigationToast(anchor.href);
    };

    document.addEventListener("pointerdown", handleDocumentPointerDown, true);
    document.addEventListener("click", handleDocumentClick, true);

    return () => {
      document.removeEventListener(
        "pointerdown",
        handleDocumentPointerDown,
        true
      );
      document.removeEventListener("click", handleDocumentClick, true);
    };
  }, [pathname, showNavigationToast]);

  const value = useMemo(
    () => ({
      showToast,
      showNavigationToast,
      dismissToast,
    }),
    [dismissToast, showNavigationToast, showToast]
  );

  const toastClassName =
    toast?.tone === "success"
      ? "theme-accent-soft"
      : toast?.tone === "error"
      ? "theme-overlay border-[color:color-mix(in_srgb,#f15e6c_50%,var(--foreground)_12%)]"
      : "theme-overlay";

  return (
    <ToastContext.Provider value={value}>
      {children}
      <div
        className={`pointer-events-none fixed left-1/2 top-4 z-[70] flex -translate-x-1/2 px-4 transition-all duration-200 ${
          toast ? "translate-y-0 opacity-100" : "-translate-y-2 opacity-0"
        }`}
      >
        {toast ? (
          <div
            className={`${toastClassName} pointer-events-auto inline-flex max-w-[min(92vw,560px)] items-center gap-3 rounded-full border px-4 py-2 text-sm font-medium text-[color:var(--foreground)] shadow-[0_18px_45px_rgba(0,0,0,0.35)] backdrop-blur-xl`}
          >
            <ToastGlyph tone={toast.tone} />
            <span className="min-w-0 truncate">{toast.message}</span>
            {toast.actionLabel && toast.onAction ? (
              <button
                type="button"
                onClick={toast.onAction}
                className="theme-button-solid shrink-0 rounded-full px-3 py-1 text-xs font-semibold transition hover:scale-[1.02]"
              >
                {toast.actionLabel}
              </button>
            ) : null}
          </div>
        ) : null}
      </div>
    </ToastContext.Provider>
  );
}

export function useToast() {
  const context = useContext(ToastContext);
  if (!context) {
    throw new Error("useToast must be used within a ToastProvider");
  }

  return context;
}
