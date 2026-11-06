"use client";

import { ThemeProvider } from "next-themes";
import { Suspense } from "react";
import { FlashToast } from "@/components/layout/flash-toast";
import { PwaProvider } from "@/components/layout/pwa";
import { NavigationTransitionProvider } from "@/components/shared/navigation-transition";
import { Toaster } from "@/components/ui/sonner";
import { TooltipProvider } from "@/components/ui/tooltip";

export function Providers({ children }: { children: React.ReactNode }) {
  return (
    <ThemeProvider attribute="class" defaultTheme="dark" enableSystem={false} disableTransitionOnChange>
      <TooltipProvider delayDuration={200}>
        <PwaProvider>
          <NavigationTransitionProvider>{children}</NavigationTransitionProvider>
        </PwaProvider>
        <Toaster position="bottom-right" richColors={false} closeButton />
        <Suspense fallback={null}>
          <FlashToast />
        </Suspense>
      </TooltipProvider>
    </ThemeProvider>
  );
}
