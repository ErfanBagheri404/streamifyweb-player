import type { Metadata, Viewport } from "next";
import bannerImage from "../public/Banner.png";
import "./globals.css";
import LeftPanel from "./components/LeftPanel";
import MobileAppGate from "./components/MobileAppGate";
import ShellLayout from "./components/ShellLayout";
import { AudioProvider } from "./contexts/AudioContext";
import { SettingsProvider } from "./contexts/SettingsContext";
import { SidePanelProvider } from "./contexts/SidePanelContext";
import { dmSans, spaceMono, yekanBakh } from "./fonts";

const siteUrl =
  process.env.NEXT_PUBLIC_SITE_URL ||
  (process.env.VERCEL_PROJECT_PRODUCTION_URL
    ? `https://${process.env.VERCEL_PROJECT_PRODUCTION_URL}`
    : "https://streamifyweb-player.vercel.app");

const siteName = "Streamify Player";
const siteDescription =
  "Streamify Player is a polished multi-source music experience for search, playback, lyrics, playlists, and fullscreen listening.";

export const metadata: Metadata = {
  metadataBase: new URL(siteUrl),
  title: {
    default: siteName,
    template: `%s | ${siteName}`,
  },
  description: siteDescription,
  applicationName: siteName,
  referrer: "origin-when-cross-origin",
  generator: "Next.js",
  keywords: [
    "Streamify",
    "Streamify Player",
    "music player",
    "streaming music",
    "YouTube Music player",
    "SoundCloud player",
    "JioSaavn player",
    "lyrics player",
    "web music app",
  ],
  authors: [{ name: "Streamify" }],
  creator: "Streamify",
  publisher: "Streamify",
  category: "music",
  classification: "Music Streaming Application",
  formatDetection: {
    email: false,
    address: false,
    telephone: false,
  },
  alternates: {
    canonical: "/",
  },
  openGraph: {
    type: "website",
    locale: "en_US",
    url: "/",
    siteName,
    title: siteName,
    description: siteDescription,
    countryName: "Worldwide",
    images: [
      {
        url: bannerImage.src,
        width: bannerImage.width,
        height: bannerImage.height,
        alt: `${siteName} social preview banner`,
      },
    ],
  },
  twitter: {
    card: "summary_large_image",
    title: siteName,
    description: siteDescription,
    creator: "@streamify",
    images: [
      {
        url: bannerImage.src,
        alt: `${siteName} social preview banner`,
      },
    ],
  },
  robots: {
    index: true,
    follow: true,
    nocache: false,
    googleBot: {
      index: true,
      follow: true,
      "max-image-preview": "large",
      "max-snippet": -1,
      "max-video-preview": -1,
    },
  },
  icons: {
    icon: [
      { url: "/favicon.ico", sizes: "any" },
      { url: "/StreamifyLogo.svg", type: "image/svg+xml" },
    ],
    shortcut: ["/favicon.ico"],
    apple: [{ url: "/favicon.ico" }],
  },
  appleWebApp: {
    capable: true,
    title: siteName,
    statusBarStyle: "black-translucent",
  },
  appLinks: {
    web: {
      url: siteUrl,
      should_fallback: true,
    },
  },
  archives: [siteUrl],
  assets: [bannerImage.src],
  bookmarks: [siteUrl],
  other: {
    "apple-mobile-web-app-capable": "yes",
    "apple-mobile-web-app-title": siteName,
    "mobile-web-app-capable": "yes",
    "theme-color": "#000000",
    "color-scheme": "dark",
    "msapplication-TileColor": "#000000",
  },
};

export const viewport: Viewport = {
  width: "device-width",
  initialScale: 1,
  maximumScale: 1,
  viewportFit: "cover",
  themeColor: "#000000",
  colorScheme: "dark",
};

export default function RootLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  return (
    <html
      lang="en"
      suppressHydrationWarning
      className={`h-full antialiased ${dmSans.variable} ${spaceMono.variable} ${yekanBakh.variable}`}
    >
      <body
        className={`${dmSans.className} theme-shell flex min-h-full flex-col p-2 sm:p-3 lg:h-full lg:flex-row lg:p-3`}
      >
        <SettingsProvider>
          <AudioProvider>
            <SidePanelProvider>
              <MobileAppGate />
              <LeftPanel />
              <ShellLayout>{children}</ShellLayout>
            </SidePanelProvider>
          </AudioProvider>
        </SettingsProvider>
      </body>
    </html>
  );
}
