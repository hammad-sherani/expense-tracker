import { connection } from "next/server";
import { Suspense } from "react";
import { CategoryBreakdown } from "@/components/dashboard/category-breakdown";
import { DailySpendingChart } from "@/components/dashboard/daily-spending-chart";
import { DashboardSkeleton } from "@/components/dashboard/dashboard-skeleton";
import { DuesWidget } from "@/components/dashboard/dues-widget";
import { MonthComparisonChart } from "@/components/dashboard/month-comparison-chart";
import { MonthlyTrendChart } from "@/components/dashboard/monthly-trend-chart";
import { RecentExpenses } from "@/components/dashboard/recent-expenses";
import { SummaryCards } from "@/components/dashboard/summary-cards";
import { ExportButton } from "@/components/expenses/export-button";
import { PeriodPicker } from "@/components/period/period-picker";
import { PageHeader } from "@/components/shared/page-header";
import { PendingContent } from "@/components/shared/navigation-transition";
import { requireUser } from "@/lib/auth/dal";
import { currentYearMonth, parsePeriod, periodToParam } from "@/lib/dates";
import { formatCurrency } from "@/lib/format";
import { getDashboardData } from "@/server/queries/dashboard";
import { getDuesSummary, listDuesByFriend } from "@/server/queries/dues";

export default function DashboardPage({ searchParams }: PageProps<"/">) {
  return (
    <Suspense fallback={<DashboardSkeleton />}>
      <Dashboard searchParams={searchParams} />
    </Suspense>
  );
}


async function Dashboard({ searchParams }: { searchParams: PageProps<"/">["searchParams"] }) {
  // Figures depend on "today", so always render at request time.
  await connection();
  const user = await requireUser();
  const sp = await searchParams;
  const period = parsePeriod(sp.period);
  const periodParam = periodToParam(period);
  const [data, duesSummary, owing] = await Promise.all([
    getDashboardData(user.id, period),
    getDuesSummary(user.id),
    listDuesByFriend(user.id, "OWED_TO_ME", "pending"),
  ]);
  const headline = data.cards[0];

  return (
    <>
      <PageHeader
        title="Dashboard"
        description={
          <>
            <span className="font-medium text-foreground">{data.periodLabel}</span>
            {" · "}
            {formatCurrency(headline.value)} spent across {data.expenseCount} expense
            {data.expenseCount === 1 ? "" : "s"}
          </>
        }
        actions={
          <>
            <PeriodPicker value={periodParam} current={currentYearMonth()} />
            <ExportButton params={{ period: periodParam }} label="Export" />
          </>
        }
      />

      <PendingContent className="flex flex-col gap-4">
        <SummaryCards cards={data.cards} />

        <div className="grid gap-4 lg:grid-cols-3">
          <div className="min-w-0 lg:col-span-2 [&>[data-slot=card]]:h-full">
            <MonthlyTrendChart data={data.trend} />
          </div>
          <div className="min-w-0 [&>[data-slot=card]]:h-full">
            <CategoryBreakdown data={data.categories} periodLabel={data.periodLabel} periodParam={periodParam} />
          </div>
        </div>

        <div className="grid gap-4 lg:grid-cols-3">
          <div className="min-w-0 lg:col-span-2 [&>[data-slot=card]]:h-full">
            <DailySpendingChart title={data.daily.title} data={data.daily.points} />
          </div>
          <div className="min-w-0 [&>[data-slot=card]]:h-full">
            <MonthComparisonChart data={data.comparison} />
          </div>
        </div>

        <div className="grid gap-4 lg:grid-cols-3">
          <div className="min-w-0 lg:col-span-2 [&>[data-slot=card]]:h-full">
            <RecentExpenses expenses={data.recent} periodLabel={data.periodLabel} periodParam={periodParam} />
          </div>
          <div className="min-w-0 [&>[data-slot=card]]:h-full">
            <DuesWidget summary={duesSummary} topOwing={owing.slice(0, 4)} />
          </div>
        </div>
      </PendingContent>
    </>
  );
}
