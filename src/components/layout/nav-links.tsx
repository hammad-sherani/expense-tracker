"use client";

import {
  Banknote,
  ChartPie,
  HandCoins,
  LayoutDashboard,
  ReceiptText,
  Repeat,
  Target,
  Users,
  Wallet,
} from "lucide-react";
import Link from "next/link";
import { usePathname, useSearchParams } from "next/navigation";
import { Suspense } from "react";
import { useLookups } from "@/components/layout/lookups";
import { cn } from "@/lib/utils";

export type NavVariant = "user" | "admin";

type NavItem = {
  href: string;
  label: string;
  icon: typeof Users;
  /** Carry the selected month (?period=) to this page. */
  keepPeriod: boolean;
  /** Show a count from the user's lookups next to the label. */
  badge?: "dueBills";
};
type NavSection = { label?: string; items: NavItem[] };

const NAV_SECTIONS: Record<NavVariant, NavSection[]> = {
  user: [
    {
      items: [
        { href: "/", label: "Dashboard", icon: LayoutDashboard, keepPeriod: true },
        { href: "/insights", label: "Insights", icon: ChartPie, keepPeriod: true },
      ],
    },
    {
      label: "Money",
      items: [
        { href: "/expenses", label: "Expenses", icon: ReceiptText, keepPeriod: true },
        { href: "/income", label: "Income", icon: Banknote, keepPeriod: true },
        { href: "/wallets", label: "Wallets", icon: Wallet, keepPeriod: false },
      ],
    },
    {
      label: "Planning",
      items: [
        { href: "/budgets", label: "Budgets", icon: Target, keepPeriod: true },
        { href: "/recurring", label: "Recurring bills", icon: Repeat, keepPeriod: false, badge: "dueBills" },
      ],
    },
    {
      label: "People",
      items: [
        { href: "/dues", label: "Dues", icon: HandCoins, keepPeriod: false },
        { href: "/groups", label: "Groups & trips", icon: Users, keepPeriod: false },
      ],
    },
  ],
  admin: [
    {
      items: [
        { href: "/admin", label: "Overview", icon: LayoutDashboard, keepPeriod: false },
        { href: "/admin/users", label: "Users", icon: Users, keepPeriod: false },
      ],
    },
  ],
};

function isActive(pathname: string, href: string) {
  if (href === "/" || href === "/admin") return pathname === href;
  // "/expenses/new" still counts as Expenses; "/wallets/123" as Wallets.
  return pathname === href || pathname.startsWith(`${href}/`);
}

type NavLinksProps = { variant: NavVariant; onNavigate?: () => void; className?: string };

function NavLinksInner({
  variant,
  onNavigate,
  className,
  period,
  pathname,
}: NavLinksProps & { period: string | null; pathname: string | null }) {
  const lookups = useLookups();

  return (
    <nav className={cn("flex flex-col gap-4", className)}>
      {NAV_SECTIONS[variant].map((section, i) => (
        <div key={section.label ?? i} className="flex flex-col gap-1">
          {section.label && (
            <p className="px-3 pb-1 text-[11px] font-medium tracking-wider text-muted-foreground/70 uppercase">
              {section.label}
            </p>
          )}
          {section.items.map(({ href, label, icon: Icon, keepPeriod, badge }) => {
            const active = pathname !== null && isActive(pathname, href);
            const target = keepPeriod && period ? `${href}?period=${encodeURIComponent(period)}` : href;
            const count = badge ? lookups[badge] : 0;
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
                <Icon
                  className={cn("size-4", active ? "text-primary" : "text-muted-foreground group-hover:text-foreground")}
                />
                <span className="flex-1">{label}</span>
                {count > 0 && (
                  <span
                    className="flex h-5 min-w-5 items-center justify-center rounded-full bg-destructive px-1.5 text-[11px] font-semibold text-white"
                    aria-label={`${count} due`}
                  >
                    {count}
                  </span>
                )}
              </Link>
            );
          })}
        </div>
      ))}
    </nav>
  );
}

function NavLinksWithPeriod(props: NavLinksProps) {
  // Carry the selected month across pages so the filter "sticks".
  const period = useSearchParams().get("period");
  return <NavLinksInner {...props} period={period} pathname={usePathname()} />;
}

export function NavLinks(props: NavLinksProps) {
  return (
    // The fallback can't read the URL while prerendering (dynamic routes), so nothing is highlighted until it streams in.
    <Suspense fallback={<NavLinksInner {...props} period={null} pathname={null} />}>
      <NavLinksWithPeriod {...props} />
    </Suspense>
  );
}
