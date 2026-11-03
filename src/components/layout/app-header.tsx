"use client";

import { Menu, Moon, Sun } from "lucide-react";
import { useTheme } from "next-themes";
import { useState } from "react";
import { Brand } from "@/components/layout/brand";
import { NavLinks, type NavVariant } from "@/components/layout/nav-links";
import { QuickAddButton, QuickAddShortcut } from "@/components/layout/quick-add-button";
import { Button } from "@/components/ui/button";
import { Sheet, SheetContent, SheetHeader, SheetTitle, SheetTrigger } from "@/components/ui/sheet";

export function ThemeToggle() {
  const { resolvedTheme, setTheme } = useTheme();
  return (
    <Button
      variant="ghost"
      size="icon"
      aria-label="Toggle theme"
      onClick={() => setTheme(resolvedTheme === "dark" ? "light" : "dark")}
    >
      <Sun className="hidden dark:block" />
      <Moon className="dark:hidden" />
    </Button>
  );
}

export function AppHeader({ variant, userMenu }: { variant: NavVariant; userMenu?: React.ReactNode }) {
  const [open, setOpen] = useState(false);
  const home = variant === "admin" ? "/admin/users" : "/";
  const subtitle = variant === "admin" ? "Admin console" : undefined;

  return (
    <header className="sticky top-0 z-30 flex h-14 items-center gap-2 border-b bg-background/80 px-4 backdrop-blur-md sm:px-6 lg:justify-end lg:border-b-0 lg:bg-transparent lg:backdrop-blur-none">
      {variant === "user" && <QuickAddShortcut />}
      <Sheet open={open} onOpenChange={setOpen}>
        <SheetTrigger asChild>
          <Button variant="ghost" size="icon" className="lg:hidden" aria-label="Open navigation">
            <Menu />
          </Button>
        </SheetTrigger>
        <SheetContent side="left" className="w-72 p-0">
          <SheetHeader className="border-b p-4">
            <SheetTitle className="sr-only">Navigation</SheetTitle>
            <Brand href={home} subtitle={subtitle} />
          </SheetHeader>
          <NavLinks variant={variant} className="p-3" onNavigate={() => setOpen(false)} />
        </SheetContent>
      </Sheet>
      <div className="lg:hidden">
        <Brand href={home} subtitle={subtitle} />
      </div>
      <div className="ml-auto flex items-center gap-1.5 lg:ml-0">
        <ThemeToggle />
        {variant === "user" && <QuickAddButton compact className="lg:hidden" />}
        {userMenu}
      </div>
    </header>
  );
}
