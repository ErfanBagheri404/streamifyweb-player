"use client";

import { useEffect } from "react";
import { primeMediaProviderInstances } from "../lib/media-providers";
import { primeRuntimeConfig } from "../lib/runtime-config";

let runtimeBootstrapStarted = false;

export default function RuntimeConfigBootstrap() {
  useEffect(() => {
    if (runtimeBootstrapStarted) return;
    runtimeBootstrapStarted = true;

    void primeRuntimeConfig();
    void primeMediaProviderInstances();

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
