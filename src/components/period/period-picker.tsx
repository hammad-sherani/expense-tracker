"use client";

import { CalendarRange, ChevronLeft, ChevronRight, Loader2 } from "lucide-react";
import { usePathname, useSearchParams } from "next/navigation";
import { useNavigationTransition } from "@/components/shared/navigation-transition";
import { Button } from "@/components/ui/button";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Tooltip, TooltipContent, TooltipTrigger } from "@/components/ui/tooltip";
import {
  MONTH_NAMES,
  type Period,
  parsePeriod,
  periodToParam,
  shiftMonth,
} from "@/lib/dates";
import { cn } from "@/lib/utils";

const FIRST_YEAR = 2015;

export function PeriodPicker({
  value,
  current,
  className,
}: {
  /** Resolved period param from the server ("YYYY-MM" or "all"). */
  value: string;
  /** Current month in the app timezone, computed on the server at request time. */
  current: { year: number; month: number };
  className?: string;
}) {
  const now = current;
  const period = value === "all" ? ({ kind: "all" } as const) : parsePeriod(value);
  const pathname = usePathname();
  const searchParams = useSearchParams();
  const { navigate, isPending } = useNavigationTransition();

  const isAll = period.kind === "all";
  const anchor = period.kind === "month" ? period : now;
  const isCurrent = !isAll && anchor.year === now.year && anchor.month === now.month;

  const go = (next: Period) => {
    const params = new URLSearchParams(searchParams.toString());
    params.set("period", periodToParam(next));
    params.delete("page"); // a new period starts at page 1
    navigate(`${pathname}?${params.toString()}`);
  };

  const goMonth = (year: number, month: number) => go({ kind: "month", year, month });

  const maxYear = Math.max(now.year + 1, anchor.year);
  const years = Array.from({ length: maxYear - Math.min(FIRST_YEAR, anchor.year) + 1 }, (_, i) => maxYear - i);

  return (
    <div className={cn("flex flex-wrap items-center gap-2", className)}>
      <div className="inline-flex rounded-lg bg-muted p-0.5" role="group" aria-label="Period type">
        <button
          type="button"
          onClick={() => isAll && goMonth(now.year, now.month)}
          aria-pressed={!isAll}
          className={cn(
            "rounded-md px-3 py-1 text-xs font-medium transition-colors",
            !isAll ? "bg-background text-foreground shadow-xs" : "text-muted-foreground hover:text-foreground",
          )}
        >
          Monthly
        </button>
        <button
          type="button"
          onClick={() => !isAll && go({ kind: "all" })}
          aria-pressed={isAll}
          className={cn(
            "rounded-md px-3 py-1 text-xs font-medium transition-colors",
            isAll ? "bg-background text-foreground shadow-xs" : "text-muted-foreground hover:text-foreground",
          )}
        >
          All time
        </button>
      </div>

      <div className={cn("flex items-center gap-1", isAll && "opacity-60")}>
        <Tooltip>
          <TooltipTrigger asChild>
            <Button
              variant="outline"
              size="icon"
              aria-label="Previous month"
              onClick={() => {
                const p = shiftMonth(anchor.year, anchor.month, -1);
                goMonth(p.year, p.month);
              }}
            >
              <ChevronLeft />
            </Button>
          </TooltipTrigger>
          <TooltipContent>Previous month</TooltipContent>
        </Tooltip>

        <Select value={String(anchor.month)} onValueChange={(m) => goMonth(anchor.year, Number(m))}>
          <SelectTrigger className="w-[8.5rem]" aria-label="Month">
            <SelectValue>{MONTH_NAMES[anchor.month - 1]}</SelectValue>
          </SelectTrigger>
          <SelectContent>
            {MONTH_NAMES.map((name, i) => (
              <SelectItem key={name} value={String(i + 1)}>
                {name}
              </SelectItem>
            ))}
          </SelectContent>
        </Select>

        <Select value={String(anchor.year)} onValueChange={(y) => goMonth(Number(y), anchor.month)}>
          <SelectTrigger className="w-[5.75rem]" aria-label="Year">
            <SelectValue>{anchor.year}</SelectValue>
          </SelectTrigger>
          <SelectContent className="max-h-72">
            {years.map((y) => (
              <SelectItem key={y} value={String(y)}>
                {y}
              </SelectItem>
            ))}
          </SelectContent>
        </Select>

        <Tooltip>
          <TooltipTrigger asChild>
            <Button
              variant="outline"
              size="icon"
              aria-label="Next month"
              onClick={() => {
                const n = shiftMonth(anchor.year, anchor.month, 1);
                goMonth(n.year, n.month);
              }}
            >
              <ChevronRight />
            </Button>
          </TooltipTrigger>
          <TooltipContent>Next month</TooltipContent>
        </Tooltip>
      </div>

      {!isCurrent && (
        <Button variant="ghost" size="sm" onClick={() => goMonth(now.year, now.month)}>
          <CalendarRange />
          This month
        </Button>
      )}

      <Loader2
        aria-hidden={!isPending}
        className={cn("size-4 animate-spin text-muted-foreground transition-opacity", isPending ? "opacity-100" : "opacity-0")}
      />
    </div>
  );
}
