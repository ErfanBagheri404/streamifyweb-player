const previewBackendApiEnv =
  process.env.VERCEL_ENV === "preview"
    ? {
        NEXT_PUBLIC_STREAMIFY_API_MODE:
          process.env.NEXT_PUBLIC_STREAMIFY_API_MODE || "absolute",
        NEXT_PUBLIC_STREAMIFY_API_BASE_URL:
          process.env.NEXT_PUBLIC_STREAMIFY_API_BASE_URL ||
          "https://api.streamify.workers.dev",
        NEXT_PUBLIC_STREAMIFY_API_ROUTES:
          process.env.NEXT_PUBLIC_STREAMIFY_API_ROUTES ||
          "/video,/audio-proxy,/license-proxy,/search,/artist,/collection,/lyrics",
      }
    : {};

/** @type {import('next').NextConfig} */
const nextConfig = {
  env: previewBackendApiEnv,
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
        hostname: "i.scdn.co",
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
