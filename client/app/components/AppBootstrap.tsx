"use client";

import { useEffect } from "react";

let appBootstrapStarted = false;

export default function AppBootstrap() {
  useEffect(() => {
    if (appBootstrapStarted) return;
    appBootstrapStarted = true;

    if (
      process.env.NODE_ENV === "production" &&
      typeof window !== "undefined" &&
      "serviceWorker" in navigator
    ) {
      void navigator.serviceWorker.register("/sw.js").catch(() => {});
    }
  }, []);

  return null;
}
