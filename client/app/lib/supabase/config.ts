const CLIENT_ENV = {
  NEXT_PUBLIC_SUPABASE_URL: process.env.NEXT_PUBLIC_SUPABASE_URL?.trim() || "",
  NEXT_PUBLIC_SUPABASE_ANON_KEY:
    process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY?.trim() || "",
  NEXT_PUBLIC_SITE_URL: process.env.NEXT_PUBLIC_SITE_URL?.trim() || "",
} as const;

function readRequiredEnv(name: keyof typeof CLIENT_ENV): string {
  const value = CLIENT_ENV[name];
  if (!value) {
    throw new Error(`Missing required Supabase environment variable: ${name}`);
  }

  return value;
}

function readOptionalEnv(name: keyof typeof CLIENT_ENV): string | null {
  return CLIENT_ENV[name] || null;
}

export function getSupabaseConfig() {
  return {
    url: readRequiredEnv("NEXT_PUBLIC_SUPABASE_URL"),
    anonKey: readRequiredEnv("NEXT_PUBLIC_SUPABASE_ANON_KEY"),
  };
}

export function getOptionalSupabaseConfig() {
  const url = readOptionalEnv("NEXT_PUBLIC_SUPABASE_URL");
  const anonKey = readOptionalEnv("NEXT_PUBLIC_SUPABASE_ANON_KEY");

  if (!url || !anonKey) {
    return null;
  }

  return { url, anonKey };
}

export function hasSupabaseConfig() {
  return getOptionalSupabaseConfig() !== null;
}

export function getBaseUrl() {
  if (typeof window !== "undefined") {
    return window.location.origin;
  }

  return (
    CLIENT_ENV.NEXT_PUBLIC_SITE_URL ||
    (process.env.VERCEL_URL ? `https://${process.env.VERCEL_URL}` : "") ||
    "http://localhost:3000"
  );
}
