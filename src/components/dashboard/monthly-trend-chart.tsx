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
  const hasIncome = data.some((p) => p.income > 0);
  const anySelected = data.some((d) => d.isSelected);

  return (
    <Card className="gap-4">
      <CardHeader>
        <CardTitle>Monthly trend</CardTitle>
        <CardDescription>
          Last 12 months · {formatCurrency(total)} spent · {formatCurrency(roundMoney(avg))} avg / active month
          {hasIncome && " · green bars show income"}
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
                const rows = [{ name: "Spent", value: p.total, color: "var(--chart-1)" }];
                if (hasIncome) {
                  rows.push({ name: "Income", value: p.income, color: "var(--success)" });
                  rows.push({ name: "Saved", value: roundMoney(p.income - p.total), color: "" });
                }
                return <ChartTooltipCard title={p.fullLabel} rows={rows} />;
              }}
            />
            {hasIncome && (
              <Bar dataKey="income" name="Income" radius={[4, 4, 0, 0]} maxBarSize={22}>
                {data.map((p) => (
                  <Cell
                    key={p.key}
                    fill="var(--success)"
                    fillOpacity={anySelected ? (p.isSelected ? 0.9 : 0.3) : 0.7}
                  />
                ))}
              </Bar>
            )}
            <Bar dataKey="total" name="Spent" radius={[4, 4, 0, 0]} maxBarSize={hasIncome ? 22 : 36}>
              {data.map((p) => (
                <Cell key={p.key} fill="var(--chart-1)" fillOpacity={anySelected ? (p.isSelected ? 1 : 0.35) : 0.85} />
              ))}
            </Bar>
          </BarChart>
        </ResponsiveContainer>
      </CardContent>
    </Card>
  );
}
