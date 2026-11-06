import { Banknote, SearchX } from "lucide-react";
import type { Metadata } from "next";
import { connection } from "next/server";
import { Suspense } from "react";
import { PageHeaderSkeleton } from "@/components/dashboard/dashboard-skeleton";
import { Pagination } from "@/components/expenses/pagination";
import { AddIncomeButton, IncomeFilters, IncomeList } from "@/components/income/income-list";
import { PeriodPicker } from "@/components/period/period-picker";
import { EmptyState } from "@/components/shared/empty-state";
import { PendingContent } from "@/components/shared/navigation-transition";
import { PageHeader } from "@/components/shared/page-header";
import { Card } from "@/components/ui/card";
import { Skeleton } from "@/components/ui/skeleton";
import { requireUser } from "@/lib/auth/dal";
import { currentYearMonth, parsePeriod, periodLabel, periodToParam } from "@/lib/dates";
import { formatCurrency, formatPercent, roundMoney } from "@/lib/format";
import { db } from "@/lib/db";
import { periodWhere } from "@/server/queries/expenses";
import { listIncome, parseIncomeListParams } from "@/server/queries/income";

export const metadata: Metadata = { title: "Income" };

export default function IncomePage({ searchParams }: PageProps<"/income">) {
  return (
    <Suspense fallback={<IncomeSkeleton />}>
      <Income searchParams={searchParams} />
    </Suspense>
  );
}

function Stat({ label, value, sub, tone }: { label: string; value: string; sub?: string; tone?: "good" | "bad" }) {
  return (
    <div className="min-w-0">
      <p className="text-xs font-medium text-muted-foreground">{label}</p>
      <p
        className={`mt-1 truncate text-xl font-semibold tracking-tight tabular-nums ${tone === "good" ? "text-success" : tone === "bad" ? "text-destructive" : ""}`}
      >
        {value}
      </p>
      {sub && <p className="mt-0.5 truncate text-xs text-muted-foreground">{sub}</p>}
    </div>
  );
}

async function Income({ searchParams }: { searchParams: PageProps<"/income">["searchParams"] }) {
  await connection();
  const user = await requireUser();
  const sp = await searchParams;
  const period = parsePeriod(sp.period);
  const periodParam = periodToParam(period);
  const params = parseIncomeListParams(sp);
  const [result, spent] = await Promise.all([
    listIncome(user.id, period, params),
    db.expense.aggregate({ where: { userId: user.id, ...periodWhere(period) }, _sum: { amount: true } }),
  ]);
  const label = periodLabel(period);
  const expenses = roundMoney(spent._sum.amount ?? 0);
  const saved = roundMoney(result.periodSum - expenses);
  const rate = result.periodSum > 0 ? (saved / result.periodSum) * 100 : null;
  const isFiltered = Boolean(params.q || params.type);

  return (
    <>
      <PageHeader
        title="Income"
        description={`Money that came in · ${label}`}
        actions={
          <>
            <PeriodPicker value={periodParam} current={currentYearMonth()} />
            <AddIncomeButton />
          </>
        }
      />
      <PendingContent className="flex flex-col gap-4">
        <Card className="grid grid-cols-2 gap-4 px-5 py-4 sm:grid-cols-4">
          <Stat label={`Income · ${label}`} value={formatCurrency(result.periodSum)} tone="good" />
          <Stat label="Spent" value={formatCurrency(expenses)} sub="Your share of expenses" />
          <Stat
            label={saved >= 0 ? "Saved" : "Overspent"}
            value={formatCurrency(Math.abs(saved))}
            tone={saved >= 0 ? "good" : "bad"}
          />
          <Stat
            label="Savings rate"
            value={rate === null ? "—" : formatPercent(rate)}
            sub={rate === null ? "Add income to see it" : "of income kept"}
            tone={rate !== null && rate < 0 ? "bad" : undefined}
          />
        </Card>

        <IncomeFilters q={params.q} type={params.type} />

        <Card className="gap-0 py-0">
          {result.items.length === 0 ? (
            isFiltered ? (
              <EmptyState icon={SearchX} title="No matching income" description="Try a different search or type." />
            ) : (
              <EmptyState
                icon={Banknote}
                title={`No income for ${label}`}
                description="Add your salary or any money you received to see your savings."
                action={<AddIncomeButton />}
              />
            )
          ) : (
            <IncomeList items={result.items} />
          )}
        </Card>
        {result.pageCount > 1 && <Pagination page={result.page} pageCount={result.pageCount} total={result.total} />}
      </PendingContent>
    </>
  );
}

function IncomeSkeleton() {
  return (
    <div aria-busy aria-label="Loading income">
      <PageHeaderSkeleton />
      <Skeleton className="h-20 w-full rounded-xl" />
      <Skeleton className="mt-4 h-9 w-full" />
      <Skeleton className="mt-4 h-72 w-full rounded-xl" />
    </div>
  );
}
