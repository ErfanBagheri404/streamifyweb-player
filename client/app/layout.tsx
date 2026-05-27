import type { Metadata } from "next";
import "./globals.css";
import LeftPanel from "./components/LeftPanel";



export const metadata: Metadata = {
  title: "Streamify Player",
  description: "Streamify. The One And Only.",
};

export default function RootLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  return (
    <html lang="en" className={`} h-full antialiased`}>
      <body className={` h-full bg-black text-white flex flex-row p-3`}>
        <LeftPanel />
        <main className="flex-1 overflow-y-auto hide-scrollbar">{children}</main>
      </body>
    </html>
  );
}