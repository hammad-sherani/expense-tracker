import { connection } from "next/server";
import { Suspense } from "react";
import { BudgetsWidget } from "@/components/dashboard/budgets-widget";
import { GoalsStrip } from "@/components/goals/goals-strip";
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
import { ReportButtons } from "@/components/reports/report-buttons";
import { MonthPlanCard } from "@/components/income/month-plan-card";
import { UpcomingBillsCard } from "@/components/recurring/recurring-ui";
import { PageHeader } from "@/components/shared/page-header";
import { PendingContent } from "@/components/shared/navigation-transition";
import { requireUser } from "@/lib/auth/dal";
import { currentYearMonth, monthLabel, parsePeriod, periodToParam } from "@/lib/dates";
import { formatCurrency } from "@/lib/format";
import { cn } from "@/lib/utils";
import { getBudgetStatus } from "@/server/budgets";
import { getDashboardData } from "@/server/queries/dashboard";
import { listCommittees, upcomingCollections, upcomingCommittees } from "@/server/queries/committees";
import { listLoans, upcomingLoans } from "@/server/queries/loans";
import { listDeadlines, soonDeadlines } from "@/server/tax-deadlines";
import { DeadlinesCard } from "@/components/tax/tax-ui";
import { listGoals } from "@/server/queries/goals";
import { getMonthPlan } from "@/server/queries/month-plan";
import { upcomingBills } from "@/server/queries/recurring";
import { db } from "@/lib/db";
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
  // Budgets are monthly; "All time" shows this month's.
  const budgetMonth = period.kind === "month" ? period : currentYearMonth();
  const [data, duesSummary, owing, budgets, bills, billRules, committees, plan, goals, loans, deadlines] = await Promise.all([
    getDashboardData(user.id, period),
    getDuesSummary(user.id),
    listDuesByFriend(user.id, "OWED_TO_ME", "pending"),
    getBudgetStatus(user.id, budgetMonth.year, budgetMonth.month),
    upcomingBills(user.id),
    db.recurringExpense.count({ where: { userId: user.id } }),
    listCommittees(user.id),
    period.kind === "month" ? getMonthPlan(user.id, period.year, period.month) : null,
    listGoals(user.id),
    listLoans(user.id),
    listDeadlines(user.id),
  ]);
  const soon = soonDeadlines(deadlines);
  const activeGoals = goals.filter((g) => !g.archived);
  const showPlanning = budgets.length > 0 || billRules > 0 || committees.some((c) => !c.archived) || loans.some((l) => !l.archived);
  const showPlan = plan !== null && plan.items.length > 0;
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
            {period.kind === "month" && <ReportButtons period={periodParam} />}
            <ExportButton params={{ period: periodParam }} label="Export" />
          </>
        }
      />

      <PendingContent className="flex flex-col gap-4">
        <SummaryCards cards={data.cards} />

        {activeGoals.length > 0 && <GoalsStrip goals={activeGoals} />}

        {soon.length > 0 && <DeadlinesCard deadlines={soon} compact />}

        {showPlanning && (
          <div className={cn("grid gap-4", showPlan ? "lg:grid-cols-3" : "lg:grid-cols-2")}>
            {showPlan && (
              <div className="min-w-0 [&>[data-slot=card]]:h-full">
                <MonthPlanCard plan={plan} />
              </div>
            )}
            <div className="min-w-0 [&>[data-slot=card]]:h-full">
              <BudgetsWidget budgets={budgets} periodLabel={monthLabel(budgetMonth.year, budgetMonth.month)} />
            </div>
            <div className="min-w-0 [&>[data-slot=card]]:h-full">
              <UpcomingBillsCard
                bills={bills}
                committees={upcomingCommittees(committees)}
                collections={upcomingCollections(committees)}
                loans={upcomingLoans(loans)}
              />
            </div>
          </div>
        )}

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
