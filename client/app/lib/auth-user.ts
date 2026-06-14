import type { User } from "@supabase/supabase-js";

function readTrimmedString(value: unknown): string | null {
  return typeof value === "string" && value.trim() ? value.trim() : null;
}

export function getUserDisplayName(user: User | null): string {
  if (!user) return "";

  return (
    readTrimmedString(user.user_metadata?.full_name) ||
    readTrimmedString(user.user_metadata?.name) ||
    readTrimmedString(user.user_metadata?.preferred_username) ||
    readTrimmedString(user.user_metadata?.user_name) ||
    readTrimmedString(user.user_metadata?.nick_name) ||
    readTrimmedString(user.email) ||
    ""
  );
}

export function getUserAvatarUrl(user: User | null): string | null {
  if (!user) return null;

  return (
    readTrimmedString(user.user_metadata?.avatar_url) ||
    readTrimmedString(user.user_metadata?.picture) ||
    readTrimmedString(user.user_metadata?.image) ||
    readTrimmedString(user.user_metadata?.profile_image_url) ||
    readTrimmedString(user.user_metadata?.photo_url) ||
    readTrimmedString(user.user_metadata?.photoURL) ||
    null
  );
}

export function getUserProviders(user: User | null): string[] {
  if (!user) return [];

  const providers = new Set<string>();
  const appProvider = readTrimmedString(user.app_metadata?.provider);

  if (appProvider) {
    providers.add(appProvider.toLowerCase());
  }

  const appProviders = user.app_metadata?.providers;
  if (Array.isArray(appProviders)) {
    for (const provider of appProviders) {
      const value = readTrimmedString(provider);
      if (value) {
        providers.add(value.toLowerCase());
      }
    }
  }

  if (Array.isArray(user.identities)) {
    for (const identity of user.identities) {
      const value = readTrimmedString(identity?.provider);
      if (value) {
        providers.add(value.toLowerCase());
      }
    }
  }

  return [...providers];
}

export function hasUserProvider(
  user: User | null,
  provider: "email" | "google"
): boolean {
  return getUserProviders(user).includes(provider);
}
