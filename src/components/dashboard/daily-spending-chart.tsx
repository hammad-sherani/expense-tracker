"use client";

import { Bar, BarChart, CartesianGrid, ReferenceLine, ResponsiveContainer, Tooltip, XAxis, YAxis } from "recharts";
import { ChartTooltipCard } from "@/components/dashboard/chart-tooltip";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { formatCurrency, formatCurrencyCompact } from "@/lib/format";
import type { DailyPoint } from "@/types";

export function DailySpendingChart({ title, data }: { title: string; data: DailyPoint[] }) {
  const peak = data.reduce<DailyPoint | null>((max, p) => (p.total > (max?.total ?? 0) ? p : max), null);
  const activeDays = data.filter((p) => p.total > 0).length;
  const avg = activeDays ? data.reduce((a, p) => a + p.total, 0) / activeDays : 0;

  return (
    <Card className="gap-4">
      <CardHeader>
        <CardTitle>{title}</CardTitle>
        <CardDescription>
          {peak
            ? `Highest: ${formatCurrency(peak.total)} on ${peak.label} · ${activeDays} day${activeDays === 1 ? "" : "s"} with spending`
            : "No spending recorded in this period"}
        </CardDescription>
      </CardHeader>
      <CardContent className="h-64 pr-2 pl-0">
        <ResponsiveContainer width="100%" height="100%">
          <BarChart data={data} margin={{ top: 8, right: 8, left: 8, bottom: 0 }} barCategoryGap="18%">
            <CartesianGrid vertical={false} stroke="var(--border)" />
            <XAxis
              dataKey="label"
              tickLine={false}
              axisLine={false}
              tickMargin={8}
              minTickGap={16}
              tick={{ fill: "var(--muted-foreground)", fontSize: 12 }}
              // label is e.g. "3 Nov" (unique per bar); show just the day number.
              tickFormatter={(label: string) => label.split(" ")[0]}
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
                const p = payload[0].payload as DailyPoint;
                return <ChartTooltipCard title={p.label} rows={[{ name: "Spent", value: p.total }]} />;
              }}
            />
            {avg > 0 && (
              <ReferenceLine
                y={avg}
                stroke="var(--muted-foreground)"
                strokeDasharray="4 4"
                strokeOpacity={0.6}
                label={{
                  value: `avg ${formatCurrencyCompact(avg)}`,
                  position: "insideTopRight",
                  fill: "var(--muted-foreground)",
                  fontSize: 11,
                }}
              />
            )}
            <Bar dataKey="total" fill="var(--chart-1)" radius={[4, 4, 0, 0]} maxBarSize={18} />
          </BarChart>
        </ResponsiveContainer>
      </CardContent>
    </Card>
  );
}
