"use client";

import { Bar, BarChart, CartesianGrid, Cell, ResponsiveContainer, Tooltip, XAxis, YAxis } from "recharts";
import { ChartTooltipCard } from "@/components/dashboard/chart-tooltip";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { formatCurrency, formatCurrencyCompact, roundMoney } from "@/lib/format";
import type { TrendPoint } from "@/types";

export function MonthlyTrendChart({ data }: { data: TrendPoint[] }) {
  const total = roundMoney(data.reduce((a, p) => a + p.total, 0));
  const active = data.filter((p) => p.total > 0).length;
  const avg = active ? total / active : 0;

  return (
    <Card className="gap-4">
      <CardHeader>
        <CardTitle>Monthly trend</CardTitle>
        <CardDescription>
          Last 12 months · {formatCurrency(total)} total · {formatCurrency(roundMoney(avg))} avg / active month
        </CardDescription>
      </CardHeader>
      <CardContent className="h-64 pr-2 pl-0">
        <ResponsiveContainer width="100%" height="100%">
          <BarChart data={data} margin={{ top: 8, right: 8, left: 8, bottom: 0 }} barCategoryGap="22%">
            <CartesianGrid vertical={false} stroke="var(--border)" />
            <XAxis
              dataKey="label"
              tickLine={false}
              axisLine={false}
              tickMargin={8}
              tick={{ fill: "var(--muted-foreground)", fontSize: 12 }}
              interval="preserveStartEnd"
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
                const p = payload[0].payload as TrendPoint;
                return <ChartTooltipCard title={p.fullLabel} rows={[{ name: "Spent", value: p.total }]} />;
              }}
            />
            <Bar dataKey="total" radius={[4, 4, 0, 0]} maxBarSize={36}>
              {data.map((p) => (
                <Cell
                  key={p.key}
                  fill="var(--chart-1)"
                  fillOpacity={data.some((d) => d.isSelected) ? (p.isSelected ? 1 : 0.35) : 0.85}
                />
              ))}
            </Bar>
          </BarChart>
        </ResponsiveContainer>
      </CardContent>
    </Card>
  );
}
