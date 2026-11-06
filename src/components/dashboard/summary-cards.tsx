import {
  ArrowDownRight,
  ArrowUpRight,
  Banknote,
  CalendarClock,
  CalendarDays,
  CalendarRange,
  Gauge,
  History,
  PiggyBank,
  Wallet,
} from "lucide-react";
import { Card } from "@/components/ui/card";
import { formatCurrency, formatPercent } from "@/lib/format";
import { cn } from "@/lib/utils";
import type { SummaryCard } from "@/types";

const ICONS = {
  month: Wallet,
  previous: History,
  year: CalendarRange,
  today: CalendarClock,
  avg: Gauge,
  all: CalendarDays,
  income: Banknote,
  saved: PiggyBank,
} as const;

function Change({ value, label }: { value: number | null | undefined; label?: string }) {
  if (value === undefined) return null;
  if (value === null) {
    return <p className="text-xs text-muted-foreground">No spending {label}</p>;
  }
  // For expenses, spending *more* is the negative outcome.
  const up = value > 0;
  const flat = Math.abs(value) < 0.05;
  return (
    <p className="flex items-center gap-1 text-xs text-muted-foreground">
      <span
        className={cn(
          "inline-flex items-center gap-0.5 rounded-md px-1 py-0.5 font-medium",
          flat ? "bg-muted text-muted-foreground" : up ? "bg-destructive/10 text-destructive" : "bg-success/10 text-success",
        )}
      >
        {!flat && (up ? <ArrowUpRight className="size-3" /> : <ArrowDownRight className="size-3" />)}
        {formatPercent(Math.abs(value))}
      </span>
      {label}
    </p>
  );
}

export function SummaryCards({ cards }: { cards: SummaryCard[] }) {
  return (
    <div className="grid grid-cols-1 gap-4 sm:grid-cols-2 xl:grid-cols-5">
      {cards.map((card, i) => {
        const Icon = ICONS[card.key as keyof typeof ICONS] ?? Wallet;
        const primary = i === 0;
        return (
          <Card
            key={card.key}
            className={cn(
              "gap-3 px-5 py-5 transition-shadow hover:shadow-sm",
              primary && "sm:col-span-2 xl:col-span-1",
            )}
          >
            <div className="flex items-center justify-between">
              <p className="text-sm font-medium text-muted-foreground">{card.label}</p>
              <span
                className={cn(
                  "flex size-8 items-center justify-center rounded-lg",
                  primary ? "bg-primary text-primary-foreground" : "bg-muted text-muted-foreground",
                )}
              >
                <Icon className="size-4" />
              </span>
            </div>
            <p className="truncate text-2xl font-semibold tracking-tight tabular-nums" title={formatCurrency(card.value)}>
              {formatCurrency(card.value)}
            </p>
            <div className="flex min-h-5 flex-col gap-1">
              {card.change !== undefined ? (
                <Change value={card.change} label={card.changeLabel} />
              ) : (
                <p className="truncate text-xs text-muted-foreground">{card.hint}</p>
              )}
            </div>
            {card.change !== undefined && <p className="-mt-2 truncate text-xs text-muted-foreground">{card.hint}</p>}
          </Card>
        );
      })}
    </div>
  );
}
