"use client";

import { ArrowDownRight, ArrowUpRight, Minus } from "lucide-react";
import { CartesianGrid, Line, LineChart, ResponsiveContainer, Tooltip, XAxis, YAxis } from "recharts";
import { ChartTooltipCard } from "@/components/dashboard/chart-tooltip";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { formatCurrency, formatCurrencyCompact, formatPercent, roundMoney } from "@/lib/format";
import { cn } from "@/lib/utils";
import type { DashboardData } from "@/types";

const CURRENT_COLOR = "var(--chart-1)";
const PREVIOUS_COLOR = "var(--muted-foreground)";

export function MonthComparisonChart({ data }: { data: DashboardData["comparison"] }) {
  const diff = roundMoney(data.currentTotal - data.previousTotal);
  const up = diff > 0;
  const flat = diff === 0;

  return (
    <Card className="gap-4">
      <CardHeader>
        <CardTitle>Month over month</CardTitle>
        <CardDescription>Cumulative spending by day of month</CardDescription>
      </CardHeader>
      <CardContent className="flex flex-col gap-4">
        <div className="grid grid-cols-2 gap-3">
          <div className="rounded-lg bg-muted/50 p-3">
            <p className="flex items-center gap-1.5 text-xs text-muted-foreground">
              <span className="h-0.5 w-3 rounded-full" style={{ backgroundColor: CURRENT_COLOR }} />
              {data.currentLabel}
            </p>
            <p className="mt-1 text-lg font-semibold tabular-nums">{formatCurrency(data.currentTotal)}</p>
          </div>
          <div className="rounded-lg bg-muted/50 p-3">
            <p className="flex items-center gap-1.5 text-xs text-muted-foreground">
              <span className="w-3 border-t-2 border-dashed" style={{ borderColor: PREVIOUS_COLOR }} />
              {data.previousLabel}
            </p>
            <p className="mt-1 text-lg font-semibold tabular-nums">{formatCurrency(data.previousTotal)}</p>
          </div>
        </div>
        <p className="flex flex-wrap items-center gap-1.5 text-sm text-muted-foreground">
          <span
            className={cn(
              "inline-flex items-center gap-0.5 rounded-md px-1.5 py-0.5 text-xs font-medium",
              flat ? "bg-muted" : up ? "bg-destructive/10 text-destructive" : "bg-success/10 text-success",
            )}
          >
            {flat ? <Minus className="size-3" /> : up ? <ArrowUpRight className="size-3" /> : <ArrowDownRight className="size-3" />}
            {formatCurrency(Math.abs(diff))}
            {data.change !== null && !flat && ` (${formatPercent(Math.abs(data.change))})`}
          </span>
          {flat ? "Same as" : up ? "more than" : "less than"} {data.previousLabel}
        </p>
        <div className="-ml-2 h-48">
          <ResponsiveContainer width="100%" height="100%">
            <LineChart data={data.points} margin={{ top: 4, right: 8, left: 8, bottom: 0 }}>
              <CartesianGrid vertical={false} stroke="var(--border)" />
              <XAxis
                dataKey="day"
                tickLine={false}
                axisLine={false}
                tickMargin={8}
                minTickGap={20}
                tick={{ fill: "var(--muted-foreground)", fontSize: 12 }}
              />
              <YAxis
                tickLine={false}
                axisLine={false}
                width={60}
                tick={{ fill: "var(--muted-foreground)", fontSize: 12 }}
                tickFormatter={(v: number) => (v === 0 ? "0" : formatCurrencyCompact(v))}
              />
              <Tooltip
                cursor={{ stroke: "var(--border)", strokeWidth: 1 }}
                content={({ active, payload, label }) => {
                  if (!active || !payload?.length) return null;
                  const p = payload[0].payload as DashboardData["comparison"]["points"][number];
                  const rows = [];
                  if (p.current !== null) rows.push({ name: data.currentLabel, value: p.current, color: CURRENT_COLOR });
                  if (p.previous !== null)
                    rows.push({ name: data.previousLabel, value: p.previous, color: PREVIOUS_COLOR, dashed: true });
                  return <ChartTooltipCard title={`Day ${label}`} rows={rows} />;
                }}
              />
              <Line
                type="monotone"
                dataKey="previous"
                name={data.previousLabel}
                stroke={PREVIOUS_COLOR}
                strokeWidth={2}
                strokeDasharray="5 4"
                strokeOpacity={0.7}
                dot={false}
                activeDot={{ r: 4, strokeWidth: 2, stroke: "var(--card)" }}
                connectNulls={false}
              />
              <Line
                type="monotone"
                dataKey="current"
                name={data.currentLabel}
                stroke={CURRENT_COLOR}
                strokeWidth={2}
                dot={false}
                activeDot={{ r: 4, strokeWidth: 2, stroke: "var(--card)" }}
                connectNulls={false}
              />
            </LineChart>
          </ResponsiveContainer>
        </div>
      </CardContent>
    </Card>
  );
}
