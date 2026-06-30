# Cloudflare Backend Migration

## Branch Strategy

- Stable branch in the current repository remains `main`.
- Migration work lives on `backend-separation`.
- Do not cut production over by code alone. The live behavior stays controlled by runtime config.

## Current State

- Frontend consumers now use a shared backend URL helper in `client/app/lib/backend-api.ts`.
- The helper stays on same-origin by default.
- The Cloudflare Worker reads provider URLs, instance lists, and backend API settings from the Cloudflare-hosted `streamifyinstances` runtime-config payload instead of shipping hardcoded provider endpoints in the Worker.
- Runtime config can switch only selected routes to the Cloudflare Worker by setting:
  - `api.mode = "absolute"`
  - `api.baseUrl = "https://<worker-domain>"`
  - `api.absoluteRoutes = ["/video", "/audio-proxy", "/license-proxy", "/search", "/artist", "/collection", "/lyrics"]`
- Worker route coverage now includes:
  - `/video`
  - `/audio-proxy`
  - `/license-proxy`
  - `/search`
  - `/artist`
  - `/collection`
  - `/lyrics`

## Runtime Config Shape

Add this block to the Cloudflare-hosted runtime config payload:

```json
{
  "api": {
    "mode": "same-origin",
    "baseUrl": "",
    "allowedOrigins": [
      "https://your-production-frontend.example",
      "https://your-preview-frontend.example"
    ],
    "absoluteRoutes": [
      "/video",
      "/audio-proxy",
      "/license-proxy",
      "/search",
      "/artist",
      "/collection",
      "/lyrics"
    ],
    "proxy": {
      "allowedAudioHosts": [
        "googlevideo.com",
        "sndcdn.com",
        "media-streaming.soundcloud.cloud",
        "media-streaming.soundcloud.com",
        "saavncdn.com"
      ],
      "allowedLicenseHosts": [
        "license.media-streaming.soundcloud.cloud",
        "license.media-streaming.soundcloud.com"
      ]
    }
  },
  "providers": {
    "search": {
      "ytifyInstance": "https://<ytify-instance>",
      "soundcloudSearchProxyBase": "https://<soundcloud-search-backend>"
    },
    "beatseek": {
      "apiBase": "https://<beatseek-backend>"
    },
    "jiosaavn": {
      "apiBase": "https://<jiosaavn-backend>",
      "fallbackSearchBase": "https://<jiosaavn-fallback-backend>",
      "webOrigin": "https://www.jiosaavn.com"
    },
    "lyrics": {
      "lrclibBase": "https://lrclib.net",
      "lyricsOvhBase": "https://api.lyrics.ovh"
    },
    "soundcloud": {
      "clientId": "<optional-soundcloud-client-id>",
      "origin": "https://soundcloud.com",
      "mobileOrigin": "https://m.soundcloud.com",
      "apiBase": "https://api.soundcloud.com",
      "apiV2Base": "https://api-v2.soundcloud.com",
      "widgetBase": "https://w.soundcloud.com",
      "licenseBase": "https://license.media-streaming.soundcloud.cloud",
      "oembedBase": "https://soundcloud.com/oembed"
    },
    "youtube": {
      "webBase": "https://www.youtube.com",
      "musicBase": "https://music.youtube.com",
      "oembedBase": "https://www.youtube.com/oembed",
      "imageBase": "https://i.ytimg.com"
    }
  },
  "instances": {
    "client": {
      "piped": ["https://<piped-instance>"],
      "invidious": ["https://<invidious-instance>"]
    }
  },
  "headers": {
    "origins": {
      "soundcloud": "https://soundcloud.com",
      "youtube": "https://www.youtube.com",
      "jiosaavn": "https://www.jiosaavn.com"
    },
    "referers": {
      "soundcloud": "https://soundcloud.com/",
      "youtube": "https://www.youtube.com/",
      "jiosaavn": "https://www.jiosaavn.com/"
    }
  }
}
```

Rules:

- `mode = "same-origin"` keeps all frontend requests on `client/app/api/...`.
- `mode = "absolute"` enables Worker routing.
- `absoluteRoutes` limits which routes move to the Worker while the migration is in progress.
- An empty `absoluteRoutes` array means "send all backend routes handled by the helper to the Worker".
- `api.proxy.allowedAudioHosts` and `api.proxy.allowedLicenseHosts` are the Worker-side proxy safelists and should be managed in `streamifyinstances`, not hardcoded in the Worker.
- `providers.soundcloud.clientId` is optional but recommended so preview and production do not rely on scraping a fresh SoundCloud client id at runtime.

## Preview Deployment

### Frontend preview from `backend-separation`

- Deploy the frontend preview build from `backend-separation`.
- Keep preview `STREAMIFY_CONFIG_URL` or `NEXT_PUBLIC_STREAMIFY_CONFIG_URL` pointed at the preview runtime-config document.
- In preview runtime config, set:
  - `api.mode = "absolute"`
  - `api.baseUrl = "https://<preview-worker-domain>"`
  - `api.absoluteRoutes = ["/video", "/audio-proxy", "/license-proxy", "/search", "/artist", "/collection", "/lyrics"]`

### Cloudflare Worker preview

- Worker app lives in `cloudflare-api/`.
- Worker provider/instance values come from the preview `streamifyinstances` config payload, so that preview and production can diverge without code edits.
- Install dependencies:

```bash
npm install --prefix cloudflare-api
```

- Start local Worker dev:

```bash
npm run dev --prefix cloudflare-api
```

- Deploy preview Worker:

```bash
npm run deploy:preview --prefix cloudflare-api
```

- Required Worker vars for preview:
  - `CONFIG_URL=https://<preview-config-endpoint>`
  - `STREAMIFY_SERVER_FETCH_SECRET=<same secret used by runtime config if required>`
  - `ALLOWED_ORIGINS=https://<preview-frontend-domain>,https://<local-frontend-domain>`
  - `WORKER_ENV=preview`

### Vercel preview

- Project root still uses `client` as the Vercel work directory.
- Build command: `npm run build`
- Start command: `npm run start`
- Recommended preview env vars:
  - `NEXT_PUBLIC_STREAMIFY_CONFIG_URL=https://<preview-config-endpoint>`
  - `STREAMIFY_CONFIG_URL=https://<preview-config-endpoint>`
  - `STREAMIFY_SERVER_FETCH_SECRET=<secret if your config service requires it>`
- Optional temporary overrides when you want to bypass runtime config during debugging:
  - `NEXT_PUBLIC_STREAMIFY_API_MODE=absolute`
  - `NEXT_PUBLIC_STREAMIFY_API_BASE_URL=https://<preview-worker-domain>`
  - `NEXT_PUBLIC_STREAMIFY_API_ROUTES=/video,/audio-proxy,/license-proxy,/search,/artist,/collection,/lyrics`

### Netlify preview

- Keep Netlify frontend behavior aligned with Vercel preview.
- Use the same preview runtime config values as Vercel preview.
- If Netlify preview stays in use, set:
  - `NEXT_PUBLIC_STREAMIFY_CONFIG_URL=https://<preview-config-endpoint>`
  - `STREAMIFY_CONFIG_URL=https://<preview-config-endpoint>`
  - `STREAMIFY_SERVER_FETCH_SECRET=<secret if needed>`

## Production Deployment

### Current production

- Keep production frontend on same-origin mode until validation is complete.
- Production runtime config should continue using:
  - `api.mode = "same-origin"`
  - empty `api.baseUrl`

### Production cutover later

After preview validation:

1. Deploy the Worker production environment.
2. Confirm the production Worker domain and allowed origins.
3. Update production runtime config to:
   - `api.mode = "absolute"`
   - `api.baseUrl = "https://<production-worker-domain>"`
   - `api.absoluteRoutes = ["/video", "/audio-proxy", "/license-proxy", "/search", "/artist", "/collection", "/lyrics"]`
4. Validate playback and SoundCloud DRM in production preview-like testing.
5. Once all migrated routes are stable, either:
   - keep a fully enumerated `absoluteRoutes` list, or
   - switch to `api.absoluteRoutes = []` to treat the Worker as the default backend.

### Cloudflare Worker production

- Deploy production Worker:

```bash
npm run deploy:production --prefix cloudflare-api
```

- Required Worker vars for production:
  - `CONFIG_URL=https://<production-config-endpoint>`
  - `STREAMIFY_SERVER_FETCH_SECRET=<secret if required>`
  - `ALLOWED_ORIGINS=https://<production-frontend-domain>`
  - `WORKER_ENV=production`

### Vercel production

- Keep the current production frontend deployment unchanged until cutover.
- Required vars:
  - `NEXT_PUBLIC_STREAMIFY_CONFIG_URL=https://<production-config-endpoint>`
  - `STREAMIFY_CONFIG_URL=https://<production-config-endpoint>`
  - `STREAMIFY_SERVER_FETCH_SECRET=<secret if needed>`
- Do not set the `NEXT_PUBLIC_STREAMIFY_API_*` override vars in normal production once runtime config is the control plane.

### Netlify production

- If Netlify remains active, mirror the Vercel production env values:
  - `NEXT_PUBLIC_STREAMIFY_CONFIG_URL=https://<production-config-endpoint>`
  - `STREAMIFY_CONFIG_URL=https://<production-config-endpoint>`
  - `STREAMIFY_SERVER_FETCH_SECRET=<secret if needed>`

## Rollback Plan

- Fast rollback stays configuration-driven.
- To roll back preview or production, change runtime config back to:
  - `api.mode = "same-origin"`
  - `api.baseUrl = ""`
- If only critical playback routes need rollback, keep `api.mode = "absolute"` but remove entries from `api.absoluteRoutes`.
- Frontend same-origin API routes remain in place, so rollback does not require a hot code revert.

## Known Gaps

- Worker preview implementation now covers playback and metadata routes:
  - `/video`
  - `/audio-proxy`
  - `/license-proxy`
  - `/search`
  - `/artist`
  - `/collection`
  - `/lyrics`
- The Worker `/video` route preserves the current response shape for playback, but it is not yet a line-for-line portable extraction of every Next.js code path.
- The Worker `youtubemusic` path currently resolves through the YouTube provider path unless a direct `jiosaavn` source is requested. This should be validated before expanding preview traffic.
- Image/helper routes such as `/youtube-thumbnail` and `/invidious-image` are not migrated in this phase.
- If the `streamifyinstances` payload omits a required provider base or instance list, the Worker no longer falls back to hardcoded provider URLs; that environment must be fixed at the config source.

## Local Verification Checklist

- Frontend local same-origin mode:
  - keep `api.mode = "same-origin"`
  - verify existing playback still works
- Frontend local preview mode:
  - start the Worker locally
  - point runtime config or env overrides to the local Worker URL
  - set `api.absoluteRoutes = ["/video", "/audio-proxy", "/license-proxy", "/search", "/artist", "/collection", "/lyrics"]`
  - verify:
    - YouTube playback
    - JioSaavn playback
    - SoundCloud non-DRM playback
    - SoundCloud DRM manifest and license flow
    - range requests on `/audio-proxy`
    - HLS manifest rewrite points `#EXT-X-KEY` to `/license-proxy`
    - search results load through the Worker
    - artist pages load through the Worker
    - collection pages load through the Worker
    - lyrics fetch through the Worker
