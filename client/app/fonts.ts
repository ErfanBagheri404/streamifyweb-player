import localFont from "next/font/local";

export const dmSans = localFont({
  variable: "--font-dm-sans",
  display: "swap",
  preload: true,
  src: [
    {
      path: "../public/fonts/DMSans/DMSans-Regular.ttf",
      weight: "400",
      style: "normal",
    },
    {
      path: "../public/fonts/DMSans/DMSans-Bold.ttf",
      weight: "700",
      style: "normal",
    },
    {
      path: "../public/fonts/DMSans/DMSans-Black.ttf",
      weight: "900",
      style: "normal",
    },
  ],
});

export const spaceMono = localFont({
  variable: "--font-space-mono",
  display: "swap",
  preload: true,
  src: [
    {
      path: "../public/fonts/SpaceMono/SpaceMono-Regular.ttf",
      weight: "400",
      style: "normal",
    },
  ],
});

export const yekanBakh = localFont({
  variable: "--font-yekan-bakh",
  display: "swap",
  preload: true,
  src: [
    {
      path: "../public/fonts/YekanBakh/yekan bakh fanum 04 regular.woff",
      weight: "400",
      style: "normal",
    },
    {
      path: "../public/fonts/YekanBakh/yekan bakh fanum 05 medium.woff",
      weight: "500",
      style: "normal",
    },
    {
      path: "../public/fonts/YekanBakh/yekan bakh fanum 06 bold.woff",
      weight: "700",
      style: "normal",
    },
    {
      path: "../public/fonts/YekanBakh/yekan bakh fanum 08 fat.woff",
      weight: "900",
      style: "normal",
    },
  ],
});
