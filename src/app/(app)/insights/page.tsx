import { ArrowDownRight, ArrowUpRight, Lightbulb, Minus, TriangleAlert } from "lucide-react";
import type { Metadata } from "next";
import { connection } from "next/server";
import { Suspense } from "react";
import { PageHeaderSkeleton } from "@/components/dashboard/dashboard-skeleton";
import { CategoryIcon } from "@/components/expenses/category-badge";
import { CategoryTrendChart, SpendingHeatmap } from "@/components/insights/insight-charts";
import { ReportButtons } from "@/components/reports/report-buttons";
import { PeriodPicker } from "@/components/period/period-picker";
import { PendingContent } from "@/components/shared/navigation-transition";
import { PageHeader } from "@/components/shared/page-header";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Skeleton } from "@/components/ui/skeleton";
import { requireUser } from "@/lib/auth/dal";
import { currentYearMonth, formatExpenseDate, parsePeriod, periodToParam } from "@/lib/dates";
import { formatCurrency, formatPercent } from "@/lib/format";
import { cn } from "@/lib/utils";
import { getInsights } from "@/server/queries/insights";

export const metadata: Metadata = { title: "Insights" };

export default function InsightsPage({ searchParams }: PageProps<"/insights">) {
  return (
    <Suspense fallback={<InsightsSkeleton />}>
      <InsightsView searchParams={searchParams} />
    </Suspense>
  );
}

/** For spending, going up is the bad direction. */
function Change({ value }: { value: number | null }) {
  if (value === null) return <span className="text-xs text-muted-foreground">new</span>;
  if (Math.abs(value) < 0.05)
    return (
      <span className="inline-flex items-center gap-0.5 text-xs text-muted-foreground">
        <Minus className="size-3" /> 0%
      </span>
    );
  const up = value > 0;
  return (
    <span className={cn("inline-flex items-center gap-0.5 text-xs font-medium", up ? "text-destructive" : "text-success")}>
      {up ? <ArrowUpRight className="size-3" /> : <ArrowDownRight className="size-3" />}
      {formatPercent(Math.abs(value), 0)}
    </span>
  );
}

async function InsightsView({ searchParams }: { searchParams: PageProps<"/insights">["searchParams"] }) {
  await connection();
  const user = await requireUser();
  const sp = await searchParams;
  const parsed = parsePeriod(sp.period);
  const { year, month } = parsed.kind === "month" ? parsed : currentYearMonth();
  const data = await getInsights(user.id, year, month);
  const periodParam = periodToParam({ kind: "month", year, month });

  return (
    <>
      <PageHeader
        title="Insights"
        description={`Where your money went · ${data.label}`}
        actions={
          <>
            <PeriodPicker value={periodParam} current={currentYearMonth()} />
            <ReportButtons period={periodParam} />
          </>
        }
      />
      <PendingContent className="flex flex-col gap-4">
        <div className="grid gap-4 sm:grid-cols-3">
          <Card className="gap-1 px-5 py-4">
            <p className="text-xs font-medium text-muted-foreground">Spent in {data.label}</p>
            <p className="text-2xl font-semibold tabular-nums">{formatCurrency(data.total)}</p>
            <p className="flex items-center gap-1.5 text-xs text-muted-foreground">
              <Change value={data.change} /> vs {data.previousLabel} ({formatCurrency(data.previousTotal)})
            </p>
          </Card>
          <Card className="gap-1 px-5 py-4">
            <p className="text-xs font-medium text-muted-foreground">Biggest day</p>
            <p className="text-2xl font-semibold tabular-nums">
              {data.heatmap.biggest ? formatCurrency(data.heatmap.biggest.total) : "—"}
            </p>
            <p className="text-xs text-muted-foreground">
              {data.heatmap.biggest ? formatExpenseDate(data.heatmap.biggest.date, { weekday: "long", day: "numeric", month: "short" }) : "No spending yet"}
            </p>
          </Card>
          <Card className="gap-1 px-5 py-4">
            <p className="text-xs font-medium text-muted-foreground">Days with spending</p>
            <p className="text-2xl font-semibold tabular-nums">
              {data.heatmap.activeDays} <span className="text-base font-normal text-muted-foreground">/ {data.heatmap.days.length}</span>
            </p>
            <p className="text-xs text-muted-foreground">{data.heatmap.days.length - data.heatmap.activeDays} no-spend days</p>
          </Card>
        </div>

        {data.unusual.length > 0 && (
          <Card className="gap-3 border-warning/40">
            <CardHeader>
              <CardTitle className="flex items-center gap-2">
                <TriangleAlert className="size-4 text-warning" />
                Unusual spending
              </CardTitle>
              <CardDescription>Compared with your own recent months.</CardDescription>
            </CardHeader>
            <CardContent>
              <ul className="flex flex-col divide-y">
                {data.unusual.map((u) => (
                  <li key={u.title} className="flex items-center gap-3 py-2.5">
                    <div className="min-w-0 flex-1">
                      <p className="truncate text-sm font-medium">{u.title}</p>
                      <p className="truncate text-xs text-muted-foreground">{u.detail}</p>
                    </div>
                    <span className="shrink-0 text-sm font-semibold tabular-nums">{formatCurrency(u.amount)}</span>
                  </li>
                ))}
              </ul>
            </CardContent>
          </Card>
        )}

        <div className="grid gap-4 lg:grid-cols-5">
          <Card className="min-w-0 lg:col-span-3">
            <CardHeader>
              <CardTitle>Category trend</CardTitle>
              <CardDescription>Last 6 months, your biggest categories</CardDescription>
            </CardHeader>
            <CardContent className="pr-2 pl-0">
              {data.trend.series.length === 0 ? (
                <p className="py-10 text-center text-sm text-muted-foreground">No expenses in these months yet.</p>
              ) : (
                <CategoryTrendChart series={data.trend.series} rows={data.trend.rows} />
              )}
            </CardContent>
          </Card>
          <Card className="min-w-0 lg:col-span-2">
            <CardHeader>
              <CardTitle>Spending calendar</CardTitle>
              <CardDescription>{data.label} · darker means more spent that day</CardDescription>
            </CardHeader>
            <CardContent>
              <SpendingHeatmap days={data.heatmap.days} max={data.heatmap.max} />
            </CardContent>
          </Card>
        </div>

        <div className="grid gap-4 lg:grid-cols-5">
          <Card className="min-w-0 gap-0 pb-0 lg:col-span-3">
            <CardHeader className="pb-4">
              <CardTitle>This month vs last month</CardTitle>
              <CardDescription>
                {data.label} compared with {data.previousLabel}, by category
              </CardDescription>
            </CardHeader>
            {data.comparison.length === 0 ? (
              <p className="px-6 pb-6 text-sm text-muted-foreground">Nothing to compare yet.</p>
            ) : (
              <div className="overflow-x-auto">
                <table className="w-full text-sm" aria-label="Spending by category, this month vs last month">
                  <thead>
                    <tr className="border-y text-xs text-muted-foreground">
                      <th className="px-6 py-2 text-left font-medium">Category</th>
                      <th className="px-3 py-2 text-right font-medium">{data.label.split(" ")[0].slice(0, 3)}</th>
                      <th className="hidden px-3 py-2 text-right font-medium sm:table-cell">
                        {data.previousLabel.split(" ")[0].slice(0, 3)}
                      </th>
                      <th className="px-6 py-2 text-right font-medium">Change</th>
                    </tr>
                  </thead>
                  <tbody className="divide-y">
                    {data.comparison.map((c) => (
                      <tr key={c.category.id || c.category.name}>
                        <td className="px-6 py-2.5">
                          <span className="flex items-center gap-2.5">
                            <CategoryIcon category={c.category} size="sm" />
                            <span className="truncate font-medium">{c.category.name}</span>
                          </span>
                        </td>
                        <td className="px-3 py-2.5 text-right font-medium tabular-nums">{formatCurrency(c.current)}</td>
                        <td className="hidden px-3 py-2.5 text-right text-muted-foreground tabular-nums sm:table-cell">
                          {formatCurrency(c.previous)}
                        </td>
                        <td className="px-6 py-2.5 text-right">
                          <Change value={c.change} />
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            )}
          </Card>
          <Card className="min-w-0 gap-0 pb-0 lg:col-span-2">
            <CardHeader className="pb-4">
              <CardTitle className="flex items-center gap-2">
                <Lightbulb className="size-4 text-muted-foreground" />
                Where it went
              </CardTitle>
              <CardDescription>Top descriptions in {data.label}</CardDescription>
            </CardHeader>
            {data.top.length === 0 ? (
              <p className="px-6 pb-6 text-sm text-muted-foreground">No expenses this month.</p>
            ) : (
              <ul className="divide-y border-t">
                {data.top.map((p) => (
                  <li key={p.name} className="flex items-center gap-3 px-6 py-2.5 text-sm">
                    <span className="min-w-0 flex-1 truncate font-medium">{p.name}</span>
                    <span className="shrink-0 text-xs text-muted-foreground">{p.count}×</span>
                    <span className="w-24 shrink-0 text-right font-medium tabular-nums">{formatCurrency(p.total)}</span>
                  </li>
                ))}
              </ul>
            )}
          </Card>
        </div>
      </PendingContent>
    </>
  );
}

function InsightsSkeleton() {
  return (
    <div aria-busy aria-label="Loading insights">
      <PageHeaderSkeleton />
      <div className="grid gap-4 sm:grid-cols-3">
        {Array.from({ length: 3 }, (_, i) => (
          <Skeleton key={i} className="h-24 rounded-xl" />
        ))}
      </div>
      <div className="mt-4 grid gap-4 lg:grid-cols-5">
        <Skeleton className="h-80 rounded-xl lg:col-span-3" />
        <Skeleton className="h-80 rounded-xl lg:col-span-2" />
      </div>
    </div>
  );
}
