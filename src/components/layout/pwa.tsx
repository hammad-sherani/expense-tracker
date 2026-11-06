"use client";

import { createContext, use, useEffect, useState, useSyncExternalStore } from "react";

const noSubscribe = () => () => {};

type BeforeInstallPromptEvent = Event & {
  prompt: () => Promise<void>;
  userChoice: Promise<{ outcome: "accepted" | "dismissed" }>;
};

type Pwa = {
  /** The browser offered installation (Chrome/Edge/Android). */
  canInstall: boolean;
  install: () => Promise<boolean>;
  /** iPhone/iPad Safari: install via Share > Add to Home Screen. */
  isIos: boolean;
  /** Already running as an installed app. */
  installed: boolean;
};

const PwaContext = createContext<Pwa>({ canInstall: false, install: async () => false, isIos: false, installed: false });

/** Registers the service worker (production only) and exposes the install prompt. */
export function PwaProvider({ children }: { children: React.ReactNode }) {
  const [deferred, setDeferred] = useState<BeforeInstallPromptEvent | null>(null);
  const [justInstalled, setJustInstalled] = useState(false);
  // Read browser-only facts without a hydration mismatch (false on the server).
  const isIos = useSyncExternalStore(
    noSubscribe,
    () => /iphone|ipad|ipod/i.test(navigator.userAgent) && !/crios|fxios/i.test(navigator.userAgent),
    () => false,
  );
  const standalone = useSyncExternalStore(
    noSubscribe,
    () => window.matchMedia("(display-mode: standalone)").matches,
    () => false,
  );

  useEffect(() => {
    if (process.env.NODE_ENV === "production" && "serviceWorker" in navigator) {
      navigator.serviceWorker.register("/sw.js", { scope: "/" }).catch(() => {});
    }
    const onPrompt = (e: Event) => {
      e.preventDefault();
      setDeferred(e as BeforeInstallPromptEvent);
    };
    const onInstalled = () => {
      setDeferred(null);
      setJustInstalled(true);
    };
    window.addEventListener("beforeinstallprompt", onPrompt);
    window.addEventListener("appinstalled", onInstalled);
    return () => {
      window.removeEventListener("beforeinstallprompt", onPrompt);
      window.removeEventListener("appinstalled", onInstalled);
    };
  }, []);

  const install = async () => {
    if (!deferred) return false;
    await deferred.prompt();
    const { outcome } = await deferred.userChoice;
    setDeferred(null);
    return outcome === "accepted";
  };

  return (
    <PwaContext value={{ canInstall: deferred !== null, install, isIos, installed: standalone || justInstalled }}>
      {children}
    </PwaContext>
  );
}

export function usePwa() {
  return use(PwaContext);
}
