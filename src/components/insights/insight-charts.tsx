"use client";

import { Bar, BarChart, CartesianGrid, Legend, ResponsiveContainer, Tooltip, XAxis, YAxis } from "recharts";
import { ChartTooltipCard } from "@/components/dashboard/chart-tooltip";
import { Tooltip as UITooltip, TooltipContent, TooltipTrigger } from "@/components/ui/tooltip";
import { formatExpenseDate } from "@/lib/dates";
import { formatCurrency, formatCurrencyCompact, roundMoney } from "@/lib/format";
import { cn } from "@/lib/utils";
import type { HeatDay, TrendRow, TrendSeries } from "@/server/queries/insights";

/** Stacked monthly spend by category (top 5 + everything else). */
export function CategoryTrendChart({ series, rows }: { series: TrendSeries[]; rows: TrendRow[] }) {
  return (
    <div className="h-72">
      <ResponsiveContainer width="100%" height="100%">
        <BarChart data={rows} margin={{ top: 8, right: 8, left: 8, bottom: 0 }} barCategoryGap="28%">
          <CartesianGrid vertical={false} stroke="var(--border)" />
          <XAxis
            dataKey="label"
            tickLine={false}
            axisLine={false}
            tickMargin={8}
            tick={{ fill: "var(--muted-foreground)", fontSize: 12 }}
          />
          <YAxis
            tickLine={false}
            axisLine={false}
            width={64}
            tick={{ fill: "var(--muted-foreground)", fontSize: 12 }}
            tickFormatter={(v: number) => (v === 0 ? "0" : formatCurrencyCompact(v))}
          />
          <Tooltip
            cursor={{ fill: "var(--muted)", opacity: 0.6 }}
            content={({ active, payload }) => {
              if (!active || !payload?.length) return null;
              const row = payload[0].payload as TrendRow;
              const items = series
                .map((s) => ({ name: s.name, value: Number(row[s.key] ?? 0), color: s.color }))
                .filter((r) => r.value > 0)
                .reverse();
              const sum = roundMoney(items.reduce((a, r) => a + r.value, 0));
              return <ChartTooltipCard title={`${row.fullLabel} · ${formatCurrency(sum)}`} rows={items} />;
            }}
          />
          <Legend
            verticalAlign="top"
            align="left"
            iconType="circle"
            iconSize={8}
            // Biggest category first, "Everything else" last (not alphabetical).
            itemSorter={(item) => series.findIndex((x) => x.key === item.dataKey)}
            wrapperStyle={{ fontSize: 12, paddingBottom: 12 }}
            formatter={(v) => <span className="text-muted-foreground">{v}</span>}
          />
          {series.map((s, i) => (
            <Bar
              key={s.key}
              dataKey={s.key}
              name={s.name}
              stackId="total"
              fill={s.color}
              // 2px surface gap between stacked segments.
              stroke="var(--card)"
              strokeWidth={2}
              radius={i === series.length - 1 ? [4, 4, 0, 0] : 0}
              maxBarSize={44}
            />
          ))}
        </BarChart>
      </ResponsiveContainer>
    </div>
  );
}

const WEEKDAYS = ["Mon", "Tue", "Wed", "Thu", "Fri", "Sat", "Sun"];
/** One hue, light to dark (sequential). Index 0 = no spending. */
const STEPS = ["bg-muted", "bg-primary/20", "bg-primary/40", "bg-primary/65", "bg-primary/90"];

function stepOf(total: number, max: number) {
  if (total <= 0 || max <= 0) return 0;
  return Math.min(4, Math.max(1, Math.ceil((total / max) * 4)));
}

/** Calendar of the month: darker = more spent that day. */
export function SpendingHeatmap({ days, max }: { days: HeatDay[]; max: number }) {
  const lead = days[0]?.weekday ?? 0;
  return (
    <div className="flex flex-col gap-3">
      <div className="grid grid-cols-7 gap-1.5 text-center text-[11px] text-muted-foreground" aria-hidden>
        {WEEKDAYS.map((d) => (
          <span key={d}>{d}</span>
        ))}
      </div>
      <div className="grid grid-cols-7 gap-1.5" role="list" aria-label="Spending per day">
        {Array.from({ length: lead }, (_, i) => (
          <span key={`pad-${i}`} aria-hidden />
        ))}
        {days.map((d) => {
          const step = stepOf(d.total, max);
          const label = `${formatExpenseDate(d.date, { weekday: "short", day: "numeric", month: "short" })}: ${
            d.total > 0 ? `${formatCurrency(d.total)} across ${d.count} expense${d.count === 1 ? "" : "s"}` : "no spending"
          }`;
          return (
            <UITooltip key={d.date}>
              <TooltipTrigger asChild>
                <span
                  role="listitem"
                  tabIndex={0}
                  aria-label={label}
                  className={cn(
                    "flex aspect-square items-start justify-start rounded-md p-1 text-[10px] font-medium tabular-nums outline-none focus-visible:ring-2 focus-visible:ring-ring",
                    STEPS[step],
                    step >= 3 ? "text-primary-foreground" : "text-muted-foreground",
                  )}
                >
                  {d.day}
                </span>
              </TooltipTrigger>
              <TooltipContent>{label}</TooltipContent>
            </UITooltip>
          );
        })}
      </div>
      <div className="flex items-center justify-end gap-1.5 text-[11px] text-muted-foreground" aria-hidden>
        Less
        {STEPS.map((s) => (
          <span key={s} className={cn("size-3 rounded-sm", s)} />
        ))}
        More
      </div>
    </div>
  );
}
