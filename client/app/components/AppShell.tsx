"use client";

import { usePathname } from "next/navigation";
import AppBootstrap from "./AppBootstrap";
import CloudLibraryBridge from "./CloudLibraryBridge";
import LeftPanel from "./LeftPanel";
import MobileAppGate from "./MobileAppGate";
import ShellLayout from "./ShellLayout";
import { isStandaloneAuthPath } from "../lib/auth-routes";
import { AudioProvider } from "../contexts/AudioContext";
import { SettingsProvider } from "../contexts/SettingsContext";
import { SidePanelProvider } from "../contexts/SidePanelContext";
import { ToastProvider } from "../contexts/ToastContext";

export default function AppShell({ children }: { children: React.ReactNode }) {
  const pathname = usePathname();
  const isAuthPage = isStandaloneAuthPath(pathname);

  if (isAuthPage) {
    return (
      <SettingsProvider>
        <ToastProvider>
          <AppBootstrap />
          {children}
        </ToastProvider>
      </SettingsProvider>
    );
  }

  return (
    <SettingsProvider>
      <ToastProvider>
        <AppBootstrap />
        <AudioProvider>
          <SidePanelProvider>
            <CloudLibraryBridge />
            <MobileAppGate />
            <LeftPanel />
            <ShellLayout>{children}</ShellLayout>
          </SidePanelProvider>
        </AudioProvider>
      </ToastProvider>
    </SettingsProvider>
  );
}
