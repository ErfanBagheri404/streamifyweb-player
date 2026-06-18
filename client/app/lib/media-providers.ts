import {
  getCachedProviderEndpointsSnapshot,
  getProviderEndpoints,
} from "./provider-endpoints";

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

const cachedProviderEndpoints = getCachedProviderEndpointsSnapshot();
const cachedPipedInstances = cachedProviderEndpoints.instances.piped;
const cachedInvidiousInstances = cachedProviderEndpoints.instances.invidious;

export const PIPED_INSTANCES = [
  ...(getEnvInstanceList(
    process.env.STREAMIFY_PIPED_INSTANCES,
    process.env.NEXT_PUBLIC_STREAMIFY_PIPED_INSTANCES
  ) || cachedPipedInstances),
];

export const INVIDIOUS_INSTANCES = [
  ...(getEnvInstanceList(
    process.env.STREAMIFY_INVIDIOUS_INSTANCES,
    process.env.NEXT_PUBLIC_STREAMIFY_INVIDIOUS_INSTANCES
  ) || cachedInvidiousInstances),
];

let providerInstanceRefreshPromise: Promise<void> | null = null;
let clientRefreshRequested = false;

function replaceInstances(target: string[], nextValues: string[]) {
  target.splice(0, target.length, ...nextValues);
}

async function refreshProviderInstances(revalidate = false) {
  const endpoints = await getProviderEndpoints({ revalidate });
  replaceInstances(PIPED_INSTANCES, endpoints.instances.piped);
  replaceInstances(INVIDIOUS_INSTANCES, endpoints.instances.invidious);
}

export async function primeMediaProviderInstances(options?: {
  revalidate?: boolean;
}): Promise<void> {
  if (!providerInstanceRefreshPromise) {
    providerInstanceRefreshPromise = refreshProviderInstances(
      options?.revalidate
    ).finally(() => {
      providerInstanceRefreshPromise = null;
    });
  }

  await providerInstanceRefreshPromise;
}

function ensureClientInstanceRefresh() {
  if (typeof window === "undefined" || clientRefreshRequested) return;
  clientRefreshRequested = true;
  void primeMediaProviderInstances({ revalidate: true });
}

export async function getPipedInstances(): Promise<string[]> {
  await primeMediaProviderInstances();
  return PIPED_INSTANCES;
}

export async function getInvidiousInstances(): Promise<string[]> {
  await primeMediaProviderInstances();
  return INVIDIOUS_INSTANCES;
}

export function isManagedRemoteAudioUrl(audioUrl: string): boolean {
  ensureClientInstanceRefresh();

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
