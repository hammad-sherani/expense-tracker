import { ArrowLeft, History } from "lucide-react";
import type { Metadata } from "next";
import Link from "next/link";
import { notFound } from "next/navigation";
import { connection } from "next/server";
import { Suspense } from "react";
import { PageHeaderSkeleton } from "@/components/dashboard/dashboard-skeleton";
import { AddExpectedButton, ExpectedRow, GoalButtons, GoalHistory } from "@/components/goals/goal-ui";
import { EmptyState } from "@/components/shared/empty-state";
import { PageHeader } from "@/components/shared/page-header";
import { Button } from "@/components/ui/button";
import { Card } from "@/components/ui/card";
import { Skeleton } from "@/components/ui/skeleton";
import { requireUser } from "@/lib/auth/dal";
import { formatExpenseDate } from "@/lib/dates";
import { formatCurrency } from "@/lib/format";
import { planSummary } from "@/lib/goals";
import { cn } from "@/lib/utils";
import { objectId } from "@/lib/validations/money";
import { getGoal, listGoals } from "@/server/queries/goals";

export const metadata: Metadata = { title: "Goal" };

export default function GoalPage({ params }: PageProps<"/goals/[id]">) {
  return (
    <Suspense fallback={<GoalSkeleton />}>
      <GoalView params={params} />
    </Suspense>
  );
}

function Stat({ label, value, sub }: { label: string; value: string; sub?: string }) {
  return (
    <Card className="gap-1 px-5 py-4">
      <p className="text-xs font-medium text-muted-foreground">{label}</p>
      <p className="truncate text-xl font-semibold tracking-tight tabular-nums">{value}</p>
      {sub && <p className="truncate text-xs text-muted-foreground">{sub}</p>}
    </Card>
  );
}

async function GoalView({ params }: { params: PageProps<"/goals/[id]">["params"] }) {
  await connection();
  const user = await requireUser();
  const { id } = await params;
  if (!objectId.safeParse(id).success) notFound();
  const [data, all] = await Promise.all([getGoal(user.id, id), listGoals(user.id)]);
  if (!data) notFound();
  const { goal: g, history, expected } = data;
  const options = all.filter((x) => !x.archived).map((x) => ({ id: x.id, name: x.name }));
  const tone =
    g.status === "reached" || g.status === "covered"
      ? "bg-success/10"
      : g.status === "passed"
        ? "bg-destructive/10"
        : "bg-primary/10";

  return (
    <>
      <Button asChild variant="ghost" size="sm" className="mb-1 -ml-2 w-fit text-muted-foreground">
        <Link href="/goals">
          <ArrowLeft />
          Goals
        </Link>
      </Button>
      <PageHeader
        title={g.name}
        description={`${g.targetDate ? `By ${formatExpenseDate(g.targetDate)}` : "No target date"}${g.archived ? " · archived" : ""}${g.notes ? ` · ${g.notes}` : ""}`}
        actions={<GoalButtons goal={g} />}
      />
      <div className="flex flex-col gap-4">
        <Card className="gap-3 px-5 py-4">
          <div className="flex items-baseline justify-between gap-3 text-sm tabular-nums">
            <span>
              <span className="text-xl font-semibold">{formatCurrency(g.saved)}</span>
              <span className="text-muted-foreground"> of {formatCurrency(g.targetAmount)}</span>
            </span>
            <span className="text-muted-foreground">{Math.floor(g.percent)}%</span>
          </div>
          <div
            className="h-2.5 overflow-hidden rounded-full bg-muted"
            role="progressbar"
            aria-label={`${g.name} progress`}
            aria-valuemin={0}
            aria-valuemax={100}
            aria-valuenow={Math.min(100, Math.round(g.percent))}
          >
            <div className="h-full rounded-full bg-primary" style={{ width: `${Math.min(100, g.percent)}%` }} />
          </div>
          <p className={cn("rounded-md px-3 py-2 text-sm font-medium", tone)} data-testid="plan-summary">
            {planSummary(g)}
          </p>
        </Card>

        <div className="grid grid-cols-2 gap-4 xl:grid-cols-4">
          <Stat label="In the fund now" value={formatCurrency(g.balance)} sub={g.spent > 0 ? `${formatCurrency(g.spent)} spent from it` : "Set aside and ready"} />
          <Stat label="Still to save" value={formatCurrency(g.remaining)} />
          <Stat
            label="Expected payments"
            value={formatCurrency(g.expectedTotal)}
            sub={`${g.expectedCount} coming${g.targetDate ? " by the date" : ""}`}
          />
          <Stat
            label="Needed per month"
            value={g.perMonthAfterExpected === null ? "—" : formatCurrency(g.perMonthAfterExpected)}
            sub={g.monthsLeft === null ? "Set a date to see this" : `${g.monthsLeft} month${g.monthsLeft === 1 ? "" : "s"} left · after expected payments`}
          />
        </div>

        <section>
          <div className="mb-3 flex items-center justify-between gap-3">
            <h2 className="text-sm font-medium text-muted-foreground">Project payments for this goal</h2>
            {!g.archived && <AddExpectedButton goals={options} defaultGoalId={g.id} variant="outline" />}
          </div>
          {expected.pending.length + expected.received.length > 0 && (
            <Card className="gap-0 py-0">
              <ul className="divide-y" aria-label="Payments for this goal">
                {[...expected.pending, ...expected.received].map((p) => (
                  <ExpectedRow key={p.id} payment={p} goals={options} />
                ))}
              </ul>
            </Card>
          )}
        </section>

        <section>
          <h2 className="mb-3 text-sm font-medium text-muted-foreground">Fund history</h2>
          <Card className="gap-0 py-0">
            {history.length === 0 ? (
              <EmptyState icon={History} title="Nothing yet" description="Money added, taken out or spent from this fund shows up here." className="py-8" />
            ) : (
              <GoalHistory rows={history} />
            )}
          </Card>
        </section>
      </div>
    </>
  );
}

function GoalSkeleton() {
  return (
    <div aria-busy aria-label="Loading goal">
      <PageHeaderSkeleton />
      <Skeleton className="h-32 rounded-xl" />
      <div className="mt-4 grid grid-cols-2 gap-4 xl:grid-cols-4">
        {Array.from({ length: 4 }, (_, i) => (
          <Skeleton key={i} className="h-20 rounded-xl" />
        ))}
      </div>
      <Skeleton className="mt-4 h-48 rounded-xl" />
    </div>
  );
}
