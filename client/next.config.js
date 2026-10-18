const isDev = process.env.NODE_ENV === "development";
const backendApiEnv = {
  // In development always stay same-origin: the local routes in app/api are the
  // ones under edit, and the deployed backends are a release behind (they still
  // return one playlist cover for every track). Absolute mode here silently
  // made the dev server test the remote API instead of local code.
  NEXT_PUBLIC_STREAMIFY_API_MODE: isDev
    ? "same-origin"
    : process.env.NEXT_PUBLIC_STREAMIFY_API_MODE || "absolute",
  NEXT_PUBLIC_STREAMIFY_API_BASE_URL: isDev
    ? ""
    : process.env.NEXT_PUBLIC_STREAMIFY_API_BASE_URL ||
      "https://helloify-api.hf.space, https://api.streamify.workers.dev",
  NEXT_PUBLIC_STREAMIFY_API_ROUTES:
    process.env.NEXT_PUBLIC_STREAMIFY_API_ROUTES ||
    "/video,/audio-proxy,/license-proxy,/search,/artist,/collection,/lyrics",
};

/** @type {import('next').NextConfig} */
const nextConfig = {
  env: backendApiEnv,
  // Next 16 blocks cross-origin access to dev resources (/_next/*, HMR websocket)
  // with a 403 unless the host is allowlisted. Accessing the dev server via
  // 127.0.0.1 or a LAN IP instead of localhost otherwise makes the page render
  // but breaks interactivity (blocked HMR + blocked POST/Origin requests).
  allowedDevOrigins: [
    "127.0.0.1",
    "localhost",
    "0.0.0.0",
    "192.168.1.101",
    "Erfan",
    "host.docker.internal",
  ],
  images: {
    remotePatterns: [
      {
        protocol: "https",
        hostname: "yt3.ggpht.com",
      },
      {
        protocol: "https",
        hostname: "yt3.googleusercontent.com",
      },
      {
        protocol: "https",
        hostname: "i.ytimg.com",
      },
      {
        protocol: "https",
        hostname: "wsrv.nl",
      },
      {
        protocol: "https",
        hostname: "proxy.piped.private.coffee",
        pathname: "/**",
      },
      {
        protocol: "https",
        hostname: "**.sndcdn.com",
      },
      {
        protocol: "https",
        hostname: "c.saavncdn.com",
      },
      {
        protocol: "https",
        hostname: "www.jiosaavn.com",
      },
    ],
  },
  async headers() {
    return [
      {
        source:
          "/:icon(Chevrondown|Filter|Fullscreen|Library|Next|Pause|Play|Previous|Repeat|Search|Settings|StreamifyLogo|Volume).svg",
        headers: [
          {
            key: "Cache-Control",
            value: "public, max-age=604800, stale-while-revalidate=2592000",
          },
        ],
      },
      {
        source: "/favicon.ico",
        headers: [
          {
            key: "Cache-Control",
            value: "public, max-age=604800, stale-while-revalidate=2592000",
          },
        ],
      },
      {
        source: "/sw.js",
        headers: [
          {
            key: "Cache-Control",
            value: "no-cache, no-store, must-revalidate",
          },
        ],
      },
    ];
  },
};

module.exports = nextConfig;
