"use client";

import { useEffect } from "react";
import { primeMediaProviderInstances } from "../lib/media-providers";
import { primeRuntimeConfig } from "../lib/runtime-config";

export default function RuntimeConfigBootstrap() {
  useEffect(() => {
    void primeRuntimeConfig();
    void primeMediaProviderInstances({ revalidate: true });
  }, []);

  return null;
}
