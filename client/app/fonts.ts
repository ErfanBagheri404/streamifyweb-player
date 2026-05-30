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
