import { getWorkerConfig, type WorkerEnv } from "./config";
import { applyCorsHeaders, json } from "./http";
import { handleArtist } from "./routes/artist";
import { handleAudioProxy } from "./routes/audio-proxy";
import { handleCollection } from "./routes/collection";
import { handleLicenseProxy } from "./routes/license-proxy";
import { handleLyrics } from "./routes/lyrics";
import { handleSearch } from "./routes/search";
import { handleVideo } from "./routes/video";

async function routeRequest(
  request: Request,
  env: WorkerEnv,
  config: Awaited<ReturnType<typeof getWorkerConfig>>
): Promise<Response> {
  const url = new URL(request.url);

  switch (url.pathname) {
    case "/health":
      return json({
        ok: true,
        service: "streamify-cloudflare-api",
        env: env.WORKER_ENV || "unknown",
      });
    case "/video":
      return handleVideo(request, config);
    case "/audio-proxy":
      return handleAudioProxy(request, config);
    case "/license-proxy":
      return handleLicenseProxy(request, config);
    case "/search":
      return handleSearch(request, config);
    case "/artist":
      return handleArtist(request, config);
    case "/collection":
      return handleCollection(request, config);
    case "/lyrics":
      return handleLyrics(request, config);
    default:
      return json({ error: "Not found" }, { status: 404 });
  }
}

export default {
  async fetch(request: Request, env: WorkerEnv): Promise<Response> {
    try {
      const config = await getWorkerConfig(env);
      const response = await routeRequest(request, env, config);
      return applyCorsHeaders(response, request, config, {
        methods: ["GET", "POST", "HEAD", "OPTIONS"],
        headers: [
          "Content-Type",
          "Origin",
          "Referer",
          "Authorization",
          "Range",
        ],
        exposeHeaders: [
          "Content-Length",
          "Content-Range",
          "Content-Type",
          "Accept-Ranges",
        ],
      });
    } catch (error) {
      const fallbackConfig = {
        api: {
          allowedOrigins: [],
          proxy: {
            allowedAudioHosts: [],
            allowedLicenseHosts: [],
          },
        },
      };

      return applyCorsHeaders(
        json(
          {
            error: "Unhandled worker error",
            details: error instanceof Error ? error.message : String(error),
          },
          { status: 500 }
        ),
        request,
        fallbackConfig,
        {
          methods: ["GET", "POST", "HEAD", "OPTIONS"],
          headers: [
            "Content-Type",
            "Origin",
            "Referer",
            "Authorization",
            "Range",
          ],
        }
      );
    }
  },
};
