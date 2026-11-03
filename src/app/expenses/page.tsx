import { Plus, ReceiptText, SearchX } from "lucide-react";
import type { Metadata } from "next";
import Link from "next/link";
import { connection } from "next/server";
import { Suspense } from "react";
import { PageHeaderSkeleton } from "@/components/dashboard/dashboard-skeleton";
import { ExpenseFilters } from "@/components/expenses/expense-filters";
import { ExpensesTable } from "@/components/expenses/expenses-table";
import { ExportButton } from "@/components/expenses/export-button";
import { Pagination } from "@/components/expenses/pagination";
import { PeriodPicker } from "@/components/period/period-picker";
import { EmptyState } from "@/components/shared/empty-state";
import { PendingContent } from "@/components/shared/navigation-transition";
import { PageHeader } from "@/components/shared/page-header";
import { Button } from "@/components/ui/button";
import { Card } from "@/components/ui/card";
import { Skeleton } from "@/components/ui/skeleton";
import { CATEGORY_META } from "@/lib/constants";
import { currentYearMonth, parsePeriod, periodLabel, periodToParam } from "@/lib/dates";
import { formatCurrency } from "@/lib/format";
import { parseExpenseListParams } from "@/lib/validations/expense";
import { listExpenses } from "@/server/queries/expenses";

export const metadata: Metadata = { title: "Expenses" };

export default function ExpensesPage({ searchParams }: PageProps<"/expenses">) {
  return (
    <Suspense fallback={<ExpensesSkeleton />}>
      <Expenses searchParams={searchParams} />
    </Suspense>
  );
}

function Stat({ label, value, sub }: { label: string; value: string; sub?: string }) {
  return (
    <div className="min-w-0">
      <p className="text-xs font-medium text-muted-foreground">{label}</p>
      <p className="mt-1 truncate text-xl font-semibold tracking-tight tabular-nums">{value}</p>
      {sub && <p className="mt-0.5 truncate text-xs text-muted-foreground">{sub}</p>}
    </div>
  );
}

async function Expenses({ searchParams }: { searchParams: PageProps<"/expenses">["searchParams"] }) {
  // The default period is "this month", so always render at request time.
  await connection();
  const sp = await searchParams;
  const period = parsePeriod(sp.period);
  const periodParam = periodToParam(period);
  const params = parseExpenseListParams(sp);
  const result = await listExpenses(period, params);
  const label = periodLabel(period);
  const isFiltered = Boolean(params.q || params.category);

  return (
    <>
      <PageHeader
        title="Expenses"
        description={`Browse, search and manage your expenses · ${label}`}
        actions={
          <>
            <PeriodPicker value={periodParam} current={currentYearMonth()} />
            <ExportButton
              params={{ period: periodParam, q: params.q, category: params.category, sort: params.sort }}
            />
            <Button asChild>
              <Link href="/expenses/new">
                <Plus />
                Add expense
              </Link>
            </Button>
          </>
        }
      />

      <PendingContent className="flex flex-col gap-4">
        <Card className="grid grid-cols-2 gap-4 px-5 py-4 sm:grid-cols-3">
          <Stat
            label={period.kind === "all" ? "All-time total" : `Total for ${label}`}
            value={formatCurrency(result.periodSum)}
            sub={`${result.periodCount} expense${result.periodCount === 1 ? "" : "s"}`}
          />
          <Stat
            label={isFiltered ? "Matching filters" : "Average expense"}
            value={formatCurrency(
              isFiltered ? result.filteredSum : result.periodCount ? result.periodSum / result.periodCount : 0,
            )}
            sub={
              isFiltered
                ? `${result.total} result${result.total === 1 ? "" : "s"}${params.category ? ` in ${CATEGORY_META[params.category].label}` : ""}`
                : "per transaction"
            }
          />
          <div className="col-span-2 hidden sm:col-span-1 sm:block">
            <Stat
              label="Share of period"
              value={
                result.periodSum > 0 ? `${((result.filteredSum / result.periodSum) * 100).toFixed(1)}%` : "—"
              }
              sub={isFiltered ? "of total spending" : "No filters applied"}
            />
          </div>
        </Card>

        <ExpenseFilters q={params.q} category={params.category} sort={params.sort} />

        <Card className="gap-0 py-0">
          {result.items.length === 0 ? (
            isFiltered ? (
              <EmptyState
                icon={SearchX}
                title="No matching expenses"
                description="Try a different search term or category, or reset the filters."
              />
            ) : (
              <EmptyState
                icon={ReceiptText}
                title={`No expenses for ${label}`}
                description="Start tracking by adding your first expense for this period."
                action={
                  <Button asChild>
                    <Link href="/expenses/new">
                      <Plus />
                      Add expense
                    </Link>
                  </Button>
                }
              />
            )
          ) : (
            <>
              <ExpensesTable expenses={result.items} sort={params.sort} />
              <Pagination page={result.page} pageCount={result.pageCount} total={result.total} />
            </>
          )}
        </Card>
      </PendingContent>
    </>
  );
}

function ExpensesSkeleton() {
  return (
    <div aria-busy aria-label="Loading expenses">
      <PageHeaderSkeleton />
      <div className="flex flex-col gap-4">
        <Card className="grid grid-cols-2 gap-4 px-5 py-4 sm:grid-cols-3">
          {Array.from({ length: 3 }, (_, i) => (
            <div key={i} className="flex flex-col gap-2">
              <Skeleton className="h-3 w-24" />
              <Skeleton className="h-6 w-32" />
              <Skeleton className="h-3 w-16" />
            </div>
          ))}
        </Card>
        <div className="flex gap-2">
          <Skeleton className="h-8 flex-1" />
          <Skeleton className="h-8 w-48" />
          <Skeleton className="h-8 w-44" />
        </div>
        <Card className="gap-0 py-0">
          {Array.from({ length: 8 }, (_, i) => (
            <div key={i} className="flex items-center gap-3 border-b px-5 py-3 last:border-0">
              <Skeleton className="size-7 rounded-lg" />
              <Skeleton className="h-4 flex-1" />
              <Skeleton className="h-5 w-24 rounded-full" />
              <Skeleton className="h-4 w-20" />
              <Skeleton className="h-4 w-20" />
            </div>
          ))}
        </Card>
      </div>
    </div>
  );
}
