"use client";

import { LayoutDashboard, PlusCircle, ReceiptText } from "lucide-react";
import Link from "next/link";
import { usePathname, useSearchParams } from "next/navigation";
import { Suspense } from "react";
import { cn } from "@/lib/utils";

const NAV_ITEMS = [
  { href: "/", label: "Dashboard", icon: LayoutDashboard, keepPeriod: true },
  { href: "/expenses", label: "Expenses", icon: ReceiptText, keepPeriod: true },
  { href: "/expenses/new", label: "Add Expense", icon: PlusCircle, keepPeriod: false },
] as const;

type NavLinksProps = { onNavigate?: () => void; className?: string };

function NavLinksInner({ onNavigate, className, period }: NavLinksProps & { period: string | null }) {
  const pathname = usePathname();

  return (
    <nav className={cn("flex flex-col gap-1", className)}>
      {NAV_ITEMS.map(({ href, label, icon: Icon, keepPeriod }) => {
        const active = href === "/" ? pathname === "/" : pathname === href;
        const target = keepPeriod && period ? `${href}?period=${encodeURIComponent(period)}` : href;
        return (
          <Link
            key={href}
            href={target}
            onClick={onNavigate}
            aria-current={active ? "page" : undefined}
            className={cn(
              "group flex items-center gap-3 rounded-lg px-3 py-2 text-sm font-medium transition-colors",
              active
                ? "bg-sidebar-accent text-sidebar-accent-foreground"
                : "text-muted-foreground hover:bg-muted/70 hover:text-foreground",
            )}
          >
            <Icon className={cn("size-4", active ? "text-primary" : "text-muted-foreground group-hover:text-foreground")} />
            {label}
          </Link>
        );
      })}
    </nav>
  );
}

function NavLinksWithPeriod(props: NavLinksProps) {
  // Carry the selected month across pages so the filter "sticks".
  const period = useSearchParams().get("period");
  return <NavLinksInner {...props} period={period} />;
}

export function NavLinks(props: NavLinksProps) {
  return (
    <Suspense fallback={<NavLinksInner {...props} period={null} />}>
      <NavLinksWithPeriod {...props} />
    </Suspense>
  );
}
