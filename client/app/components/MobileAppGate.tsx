"use client";

import { useEffect, useMemo, useState } from "react";
import { LogoIcon } from "./icons/NavIcons";

const MOBILE_GATE_STORAGE_KEY = "streamify-mobile-web-entered";
const ANDROID_APP_URL = "https://github.com/ErfanBagheri404/Streamify/";
const MOBILE_BREAKPOINT_QUERY = "(max-width: 1023.98px)";

export default function MobileAppGate() {
  const [isSmallViewport, setIsSmallViewport] = useState(false);
  const [hasEnteredWebApp, setHasEnteredWebApp] = useState(false);
  const [hasHydrated, setHasHydrated] = useState(false);

  useEffect(() => {
    if (typeof window === "undefined") return;

    const mediaQuery = window.matchMedia(MOBILE_BREAKPOINT_QUERY);

    const syncViewport = () => {
      setIsSmallViewport(mediaQuery.matches);
    };

    syncViewport();

    try {
      setHasEnteredWebApp(
        window.localStorage.getItem(MOBILE_GATE_STORAGE_KEY) === "true"
      );
    } catch {}

    setHasHydrated(true);

    if (typeof mediaQuery.addEventListener === "function") {
      mediaQuery.addEventListener("change", syncViewport);
      return () => mediaQuery.removeEventListener("change", syncViewport);
    }

    mediaQuery.addListener(syncViewport);
    return () => mediaQuery.removeListener(syncViewport);
  }, []);

  const isVisible = useMemo(
    () => hasHydrated && isSmallViewport && !hasEnteredWebApp,
    [hasEnteredWebApp, hasHydrated, isSmallViewport]
  );

  if (!isVisible) return null;

  return (
    <div className="fixed inset-0 z-[120] overflow-y-auto bg-[radial-gradient(circle_at_top,_rgba(30,215,96,0.18),_transparent_38%),linear-gradient(180deg,_rgba(0,0,0,0.82),_rgba(0,0,0,0.96))] px-4 py-6 backdrop-blur-xl">
      <div className="mx-auto flex min-h-full w-full max-w-md items-center">
        <div className="theme-surface-strong w-full overflow-hidden rounded-[32px] border border-white/10 shadow-[0_30px_90px_rgba(0,0,0,0.45)]">
          <div className="relative overflow-hidden px-6 pb-6 pt-7">
            <div className="absolute inset-x-0 top-0 h-40 bg-[radial-gradient(circle_at_top,_rgba(30,215,96,0.18),_transparent_70%)]" />

            <div className="relative">
              <div className="theme-accent-soft inline-flex h-14 w-14 items-center justify-center rounded-2xl border">
                <LogoIcon className="h-7 w-7 text-white" />
              </div>

              <div className="mt-5 space-y-3">
                <span className="inline-flex rounded-full border border-white/10 bg-white/6 px-3 py-1 text-[11px] font-semibold uppercase tracking-[0.18em] text-white/68">
                  Mobile App Coming Soon
                </span>
                <h1 className="text-3xl font-black tracking-tight text-white">
                  Streamify for Android is in development
                </h1>
                <p className="text-sm leading-6 text-white/68">
                  The mobile app is on the way. You can follow progress, check
                  updates, and access the Android project here.
                </p>
              </div>

              <div className="mt-6 rounded-[24px] border border-white/10 bg-white/[0.04] p-4">
                <div className="flex items-start gap-3">
                  <div className="flex h-11 w-11 shrink-0 items-center justify-center rounded-2xl bg-white/8 text-white/82">
                    <svg
                      xmlns="http://www.w3.org/2000/svg"
                      viewBox="0 0 24 24"
                      fill="none"
                      stroke="currentColor"
                      strokeWidth="1.8"
                      className="h-5 w-5"
                      aria-hidden="true"
                    >
                      <path
                        strokeLinecap="round"
                        strokeLinejoin="round"
                        d="M14.25 3.75h5.25v5.25M19.5 4.5l-7.5 7.5M10.5 4.5H7.8A2.55 2.55 0 0 0 5.25 7.05v9.15a2.55 2.55 0 0 0 2.55 2.55h9.15a2.55 2.55 0 0 0 2.55-2.55v-2.7"
                      />
                    </svg>
                  </div>
                  <div className="min-w-0">
                    <p className="text-sm font-semibold text-white">
                      Android app repository
                    </p>
                    <p className="mt-1 break-all text-xs leading-5 text-white/52">
                      {ANDROID_APP_URL}
                    </p>
                  </div>
                </div>
              </div>

              <div className="mt-6 flex flex-col gap-3">
                <a
                  href={ANDROID_APP_URL}
                  target="_blank"
                  rel="noreferrer"
                  className="theme-button-accent inline-flex min-h-12 items-center justify-center rounded-2xl px-4 py-3 text-sm font-semibold shadow-[0_14px_28px_rgba(0,0,0,0.24)] transition hover:scale-[1.01]"
                >
                  Open Android App Page
                </a>
                <button
                  type="button"
                  onClick={() => {
                    try {
                      window.localStorage.setItem(
                        MOBILE_GATE_STORAGE_KEY,
                        "true"
                      );
                    } catch {}
                    setHasEnteredWebApp(true);
                  }}
                  className="theme-button-soft inline-flex min-h-12 items-center justify-center rounded-2xl border px-4 py-3 text-sm font-semibold transition hover:bg-white/[0.08]"
                >
                  Enter Web App
                </button>
              </div>

              <p className="mt-4 text-center text-xs leading-5 text-white/46">
                The web app works best on larger screens, but you can still
                continue in browser if you want.
              </p>
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}
