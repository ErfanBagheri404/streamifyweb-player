"use client";

import { usePathname } from "next/navigation";
import CloudLibraryBridge from "./CloudLibraryBridge";
import LeftPanel from "./LeftPanel";
import MobileAppGate from "./MobileAppGate";
import ShellLayout from "./ShellLayout";
import { isStandaloneAuthPath } from "../lib/auth-routes";
import { AudioProvider } from "../contexts/AudioContext";
import { SettingsProvider } from "../contexts/SettingsContext";
import { SidePanelProvider } from "../contexts/SidePanelContext";

export default function AppShell({ children }: { children: React.ReactNode }) {
  const pathname = usePathname();
  const isAuthPage = isStandaloneAuthPath(pathname);

  if (isAuthPage) {
    return <SettingsProvider>{children}</SettingsProvider>;
  }

  return (
    <SettingsProvider>
      <AudioProvider>
        <SidePanelProvider>
          <CloudLibraryBridge />
          <MobileAppGate />
          <LeftPanel />
          <ShellLayout>{children}</ShellLayout>
        </SidePanelProvider>
      </AudioProvider>
    </SettingsProvider>
  );
}
