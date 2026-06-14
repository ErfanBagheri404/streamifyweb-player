function parseInstanceList(value: string | undefined): string[] {
  if (!value) return [];

  const seen = new Set<string>();
  const parsed = value
    .split(",")
    .map((entry) => entry.trim().replace(/\/+$/, ""))
    .filter(Boolean)
    .filter((entry) => {
      if (seen.has(entry)) return false;
      seen.add(entry);
      return true;
    });

  return parsed;
}

function getEnvInstanceList(
  ...candidates: Array<string | undefined>
): string[] | null {
  for (const candidate of candidates) {
    const parsed = parseInstanceList(candidate);
    if (parsed.length > 0) return parsed;
  }

  return null;
}

const defaultPipedInstances = ["https://api.piped.private.coffee"];
const defaultInvidiousInstances = [
  "https://invidious.kemonomimi.nl",
  "https://invidious.schenkel.eti.br",
  "https://invidious.tiekoetter.com",
  "https://yt.chocolatemoo53.com",
  "https://inv.nadeko.net",
  "https://lekker.gay",
];

export const PIPED_INSTANCES =
  getEnvInstanceList(
    process.env.STREAMIFY_PIPED_INSTANCES,
    process.env.NEXT_PUBLIC_STREAMIFY_PIPED_INSTANCES
  ) || defaultPipedInstances;

export const INVIDIOUS_INSTANCES =
  getEnvInstanceList(
    process.env.STREAMIFY_INVIDIOUS_INSTANCES,
    process.env.NEXT_PUBLIC_STREAMIFY_INVIDIOUS_INSTANCES
  ) || defaultInvidiousInstances;

export function isManagedRemoteAudioUrl(audioUrl: string): boolean {
  if (!audioUrl) return false;

  const normalized = audioUrl.toLowerCase();
  if (
    normalized.includes("videoplayback") ||
    normalized.includes("googlevideo.com") ||
    normalized.includes("/api/audio-proxy?url=")
  ) {
    return true;
  }

  return INVIDIOUS_INSTANCES.some((instance) => {
    try {
      return normalized.includes(new URL(instance).hostname.toLowerCase());
    } catch {
      return false;
    }
  });
}
