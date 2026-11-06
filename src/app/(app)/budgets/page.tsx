import { Target } from "lucide-react";
import type { Metadata } from "next";
import { connection } from "next/server";
import { Suspense } from "react";
import { AddBudgetButton, BudgetRow } from "@/components/budgets/budget-ui";
import { PageHeaderSkeleton } from "@/components/dashboard/dashboard-skeleton";
import { PeriodPicker } from "@/components/period/period-picker";
import { EmptyState } from "@/components/shared/empty-state";
import { PendingContent } from "@/components/shared/navigation-transition";
import { PageHeader } from "@/components/shared/page-header";
import { Card } from "@/components/ui/card";
import { Skeleton } from "@/components/ui/skeleton";
import { requireUser } from "@/lib/auth/dal";
import { takenKeys } from "@/lib/budgets";
import { currentYearMonth, monthLabel, parsePeriod, periodToParam } from "@/lib/dates";
import { formatCurrency, roundMoney } from "@/lib/format";
import { daysLeftInMonth, getBudgetStatus } from "@/server/budgets";

export const metadata: Metadata = { title: "Budgets" };

export default function BudgetsPage({ searchParams }: PageProps<"/budgets">) {
  return (
    <Suspense fallback={<BudgetsSkeleton />}>
      <Budgets searchParams={searchParams} />
    </Suspense>
  );
}

async function Budgets({ searchParams }: { searchParams: PageProps<"/budgets">["searchParams"] }) {
  await connection();
  const user = await requireUser();
  const sp = await searchParams;
  // Budgets are monthly: "All time" falls back to this month.
  const parsed = parsePeriod(sp.period);
  const { year, month } = parsed.kind === "month" ? parsed : currentYearMonth();
  const budgets = await getBudgetStatus(user.id, year, month);
  const daysLeft = daysLeftInMonth(year, month);
  const taken = takenKeys(budgets);
  const categoryBudgets = budgets.filter((b) => b.category);
  const planned = roundMoney(categoryBudgets.reduce((a, b) => a + b.amount, 0));
  const spentInBudgets = roundMoney(categoryBudgets.reduce((a, b) => a + b.spent, 0));
  const overCount = budgets.filter((b) => b.level === "over").length;

  return (
    <>
      <PageHeader
        title="Budgets"
        description={`Monthly spending limits · ${monthLabel(year, month)}`}
        actions={
          <>
            <PeriodPicker value={periodToParam({ kind: "month", year, month })} current={currentYearMonth()} />
            <AddBudgetButton taken={taken} />
          </>
        }
      />
      <PendingContent className="flex flex-col gap-4">
        {budgets.length === 0 ? (
          <Card>
            <EmptyState
              icon={Target}
              title="No budgets yet"
              description="Set a monthly limit for a category (like Food) or for all your spending. We'll warn you at 80% and when you go over."
              action={<AddBudgetButton taken={taken} label="Set your first budget" />}
            />
          </Card>
        ) : (
          <>
            <Card className="grid grid-cols-2 gap-4 px-5 py-4 sm:grid-cols-3">
              <div>
                <p className="text-xs font-medium text-muted-foreground">Category budgets</p>
                <p className="mt-1 text-xl font-semibold tabular-nums">{formatCurrency(planned)}</p>
              </div>
              <div>
                <p className="text-xs font-medium text-muted-foreground">Spent in those categories</p>
                <p className="mt-1 text-xl font-semibold tabular-nums">{formatCurrency(spentInBudgets)}</p>
              </div>
              <div className="col-span-2 sm:col-span-1">
                <p className="text-xs font-medium text-muted-foreground">Status</p>
                <p className={`mt-1 text-xl font-semibold ${overCount ? "text-destructive" : "text-success"}`}>
                  {overCount ? `${overCount} over budget` : "All within budget"}
                </p>
              </div>
            </Card>
            <Card className="gap-0 py-0">
              <ul className="divide-y">
                {budgets.map((b) => (
                  <BudgetRow key={b.id} budget={b} daysLeft={daysLeft} taken={taken} />
                ))}
              </ul>
            </Card>
          </>
        )}
      </PendingContent>
    </>
  );
}

function BudgetsSkeleton() {
  return (
    <div aria-busy aria-label="Loading budgets">
      <PageHeaderSkeleton />
      <Skeleton className="h-20 rounded-xl" />
      <Skeleton className="mt-4 h-72 rounded-xl" />
    </div>
  );
}
