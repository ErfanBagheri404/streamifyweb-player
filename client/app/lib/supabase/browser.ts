"use client";

import { createBrowserClient } from "@supabase/ssr";
import { getOptionalSupabaseConfig } from "./config";

let browserClient: ReturnType<typeof createBrowserClient> | null = null;

export function getSupabaseBrowserClient() {
  if (browserClient) return browserClient;

  const config = getOptionalSupabaseConfig();
  if (!config) {
    return null;
  }

  const { url, anonKey } = config;
  browserClient = createBrowserClient(url, anonKey);
  return browserClient;
}
