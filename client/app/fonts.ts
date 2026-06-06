import localFont from "next/font/local";
import { DM_Sans, Space_Mono } from "next/font/google";

export const dmSans = DM_Sans({
  subsets: ["latin"],
  weight: ["400", "500", "700"],
  display: "swap",
  variable: "--font-dm-sans",
  preload: true,
});

export const spaceMono = Space_Mono({
  subsets: ["latin"],
  weight: ["400"],
  display: "swap",
  variable: "--font-space-mono",
  preload: true,
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
