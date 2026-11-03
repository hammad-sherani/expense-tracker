"use client";

import { ThemeProvider } from "next-themes";
import { ExpenseUIProvider } from "@/components/expenses/expense-dialogs";
import { NavigationTransitionProvider } from "@/components/shared/navigation-transition";
import { Toaster } from "@/components/ui/sonner";
import { TooltipProvider } from "@/components/ui/tooltip";

export function Providers({ children }: { children: React.ReactNode }) {
  return (
    <ThemeProvider attribute="class" defaultTheme="light" enableSystem disableTransitionOnChange>
      <TooltipProvider delayDuration={200}>
        <NavigationTransitionProvider>
          <ExpenseUIProvider>{children}</ExpenseUIProvider>
        </NavigationTransitionProvider>
        <Toaster position="bottom-right" richColors={false} closeButton />
      </TooltipProvider>
    </ThemeProvider>
  );
}
