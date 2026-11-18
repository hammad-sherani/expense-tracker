import { Flag } from "lucide-react";
import type { Metadata } from "next";
import Link from "next/link";
import { connection } from "next/server";
import { Suspense } from "react";
import { PageHeaderSkeleton } from "@/components/dashboard/dashboard-skeleton";
import { AddExpectedButton, AddGoalButton } from "@/components/goals/goal-ui";
import { PaymentsSection } from "@/components/goals/payments-search";
import { EmptyState } from "@/components/shared/empty-state";
import { PageHeader } from "@/components/shared/page-header";
import { Card } from "@/components/ui/card";
import { Skeleton } from "@/components/ui/skeleton";
import { requireUser } from "@/lib/auth/dal";
import { formatExpenseDate } from "@/lib/dates";
import { formatCurrency } from "@/lib/format";
import { planSummary } from "@/lib/goals";
import { cn } from "@/lib/utils";
import { type GoalDTO, listExpected, listGoals } from "@/server/queries/goals";

export const metadata: Metadata = { title: "Goals" };

export default function GoalsPage() {
  return (
    <Suspense fallback={<GoalsSkeleton />}>
      <Goals />
    </Suspense>
  );
}

function GoalCard({ g }: { g: GoalDTO }) {
  return (
    <Card className={cn("relative gap-3 px-5 py-4 transition-colors hover:bg-muted/30", g.archived && "opacity-70")}>
      <div className="flex items-baseline justify-between gap-3">
        <Link href={`/goals/${g.id}`} className="truncate font-medium after:absolute after:inset-0">
          {g.name}
        </Link>
        <span className="shrink-0 text-xs text-muted-foreground">
          {g.targetDate ? `By ${formatExpenseDate(g.targetDate)}` : "No date"}
        </span>
      </div>
      <div>
        <div className="flex items-baseline justify-between gap-2 text-sm tabular-nums">
          <span>
            <span className="font-semibold">{formatCurrency(g.saved)}</span>
            <span className="text-muted-foreground"> of {formatCurrency(g.targetAmount)}</span>
          </span>
          <span className="text-xs text-muted-foreground">{Math.floor(g.percent)}%</span>
        </div>
        <div
          className="mt-1.5 h-2 overflow-hidden rounded-full bg-muted"
          role="progressbar"
          aria-label={`${g.name} progress`}
          aria-valuemin={0}
          aria-valuemax={100}
          aria-valuenow={Math.min(100, Math.round(g.percent))}
        >
          <div className="h-full rounded-full bg-primary" style={{ width: `${Math.min(100, g.percent)}%` }} />
        </div>
      </div>
      <p className="text-sm text-muted-foreground">{planSummary(g)}</p>
    </Card>
  );
}

async function Goals() {
  await connection();
  const user = await requireUser();
  const [all, expected] = await Promise.all([listGoals(user.id), listExpected(user.id)]);
  const active = all.filter((g) => !g.archived);
  const archived = all.filter((g) => g.archived);
  const options = active.map((g) => ({ id: g.id, name: g.name }));

  return (
    <>
      <PageHeader
        title="Goals"
        description="Save for something big, and plan it around the payments you're expecting."
        actions={
          <>
            <AddExpectedButton goals={options} variant="outline" />
            <AddGoalButton />
          </>
        }
      />
      <div className="flex flex-col gap-6">
        {active.length === 0 ? (
          <Card>
            <EmptyState
              icon={Flag}
              title="No goals yet"
              description="Create a goal like your Nikkah, set how much you need and by when, and we'll work out the plan."
              action={<AddGoalButton label="Create your first goal" />}
            />
          </Card>
        ) : (
          <div className="grid gap-4 lg:grid-cols-2">
            {active.map((g) => (
              <GoalCard key={g.id} g={g} />
            ))}
          </div>
        )}

        <PaymentsSection
          pending={expected.pending}
          recent={expected.received}
          allReceived={expected.allReceived}
          goals={options}
        />

        {archived.length > 0 && (
          <section>
            <h2 className="mb-3 text-sm font-medium text-muted-foreground">Archived</h2>
            <div className="grid gap-4 lg:grid-cols-2">
              {archived.map((g) => (
                <GoalCard key={g.id} g={g} />
              ))}
            </div>
          </section>
        )}
      </div>
    </>
  );
}

function GoalsSkeleton() {
  return (
    <div aria-busy aria-label="Loading goals">
      <PageHeaderSkeleton />
      <div className="grid gap-4 lg:grid-cols-2">
        <Skeleton className="h-36 rounded-xl" />
        <Skeleton className="h-36 rounded-xl" />
      </div>
      <Skeleton className="mt-6 h-48 rounded-xl" />
    </div>
  );
}
