/** @type {import('next').NextConfig} */
const nextConfig = {
  images: {
    remotePatterns: [
      {
        protocol: 'https',
        hostname: 'proxy.piped.private.coffee',
        pathname: '/**',
      },
    ],
  },
};

export default nextConfig;