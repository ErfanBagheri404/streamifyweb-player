"use client";

import {
  createContext,
  useContext,
  useEffect,
  useMemo,
  useState,
  type ReactNode,
} from "react";

interface SidePanelState {
  isOpen: boolean;
  setIsOpen: (next: boolean) => void;
  toggle: () => void;
}

const SidePanelContext = createContext<SidePanelState | undefined>(undefined);

const STORAGE_KEY = "streamifySidePanelOpen";

export function SidePanelProvider({ children }: { children: ReactNode }) {
  const [isOpen, setIsOpenState] = useState(true);

  useEffect(() => {
    if (typeof window === "undefined") return;
    try {
      const stored = window.localStorage.getItem(STORAGE_KEY);
      if (stored === "0" || stored === "1") {
        setIsOpenState(stored === "1");
      }
    } catch {}
  }, []);

  const setIsOpen = (next: boolean) => {
    setIsOpenState(next);
    if (typeof window !== "undefined") {
      try {
        window.localStorage.setItem(STORAGE_KEY, next ? "1" : "0");
      } catch {}
    }
  };

  const toggle = () => setIsOpen(!isOpen);

  const value = useMemo<SidePanelState>(
    () => ({ isOpen, setIsOpen, toggle }),
    [isOpen]
  );

  return (
    <SidePanelContext.Provider value={value}>
      {children}
    </SidePanelContext.Provider>
  );
}

export function useSidePanel() {
  const context = useContext(SidePanelContext);
  if (!context) {
    throw new Error("useSidePanel must be used within a SidePanelProvider");
  }
  return context;
}
