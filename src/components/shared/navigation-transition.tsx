"use client";

import { useRouter } from "next/navigation";
import { createContext, useCallback, useContext, useMemo, useTransition } from "react";
import { cn } from "@/lib/utils";

type NavigationTransition = {
  isPending: boolean;
  navigate: (href: string, options?: { replace?: boolean }) => void;
};

const NavigationTransitionContext = createContext<NavigationTransition | null>(null);

/**
 * Shares one transition for filter/period navigations so any part of the page
 * can show that fresh data is loading while the previous UI stays visible.
 */
export function NavigationTransitionProvider({ children }: { children: React.ReactNode }) {
  const router = useRouter();
  const [isPending, startTransition] = useTransition();

  const navigate = useCallback(
    (href: string, options?: { replace?: boolean }) => {
      startTransition(() => {
        if (options?.replace) router.replace(href, { scroll: false });
        else router.push(href, { scroll: false });
      });
    },
    [router],
  );

  const value = useMemo(() => ({ isPending, navigate }), [isPending, navigate]);

  return (
    <NavigationTransitionContext.Provider value={value}>{children}</NavigationTransitionContext.Provider>
  );
}

export function useNavigationTransition() {
  const ctx = useContext(NavigationTransitionContext);
  if (!ctx) throw new Error("useNavigationTransition must be used within NavigationTransitionProvider");
  return ctx;
}

/** Fades its content while a filter navigation is in flight. */
export function PendingContent({ children, className }: { children: React.ReactNode; className?: string }) {
  const { isPending } = useNavigationTransition();
  return (
    <div
      aria-busy={isPending}
      className={cn("transition-opacity duration-200", isPending && "pointer-events-none opacity-60", className)}
    >
      {children}
    </div>
  );
}
