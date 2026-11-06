import { Repeat } from "lucide-react";
import type { Metadata } from "next";
import { connection } from "next/server";
import { Suspense } from "react";
import { PageHeaderSkeleton } from "@/components/dashboard/dashboard-skeleton";
import { AddRecurringButton, RecurringRow } from "@/components/recurring/recurring-ui";
import { EmptyState } from "@/components/shared/empty-state";
import { PageHeader } from "@/components/shared/page-header";
import { Card } from "@/components/ui/card";
import { Skeleton } from "@/components/ui/skeleton";
import { requireUser } from "@/lib/auth/dal";
import { formatCurrency, roundMoney } from "@/lib/format";
import { listRecurring } from "@/server/queries/recurring";

export const metadata: Metadata = { title: "Recurring bills" };

export default function RecurringPage() {
  return (
    <Suspense fallback={<RecurringSkeleton />}>
      <Recurring />
    </Suspense>
  );
}

/** Rough monthly cost of a bill. */
function perMonth(amount: number, frequency: string, interval: number) {
  const n = Math.max(1, interval);
  if (frequency === "WEEKLY") return (amount * 52) / 12 / n;
  if (frequency === "YEARLY") return amount / 12 / n;
  return amount / n;
}

async function Recurring() {
  await connection();
  const user = await requireUser();
  const bills = await listRecurring(user.id);
  const active = bills.filter((b) => b.active);
  const monthly = roundMoney(active.reduce((a, b) => a + perMonth(b.amount, b.frequency, b.interval), 0));
  const due = bills.filter((b) => b.status === "overdue" || b.status === "today").length;

  return (
    <>
      <PageHeader
        title="Recurring bills"
        description="Rent, bills and subscriptions. Mark each one paid when you pay it, or skip it."
        actions={<AddRecurringButton />}
      />
      <div className="flex flex-col gap-4">
        {bills.length === 0 ? (
          <Card>
            <EmptyState
              icon={Repeat}
              title="No recurring bills"
              description="Add bills that repeat, like rent or your internet package, and they'll remind you when they're due."
              action={<AddRecurringButton label="Add your first bill" />}
            />
          </Card>
        ) : (
          <>
            <Card className="grid grid-cols-2 gap-4 px-5 py-4 sm:grid-cols-3">
              <div>
                <p className="text-xs font-medium text-muted-foreground">Active bills</p>
                <p className="mt-1 text-xl font-semibold tabular-nums">{active.length}</p>
              </div>
              <div>
                <p className="text-xs font-medium text-muted-foreground">About per month</p>
                <p className="mt-1 text-xl font-semibold tabular-nums">{formatCurrency(monthly)}</p>
              </div>
              <div className="col-span-2 sm:col-span-1">
                <p className="text-xs font-medium text-muted-foreground">Due now</p>
                <p className={`mt-1 text-xl font-semibold ${due ? "text-destructive" : ""}`}>
                  {due ? `${due} bill${due === 1 ? "" : "s"}` : "Nothing due"}
                </p>
              </div>
            </Card>
            <Card className="gap-0 py-0">
              <ul className="divide-y">
                {bills.map((b) => (
                  <RecurringRow key={b.id} bill={b} />
                ))}
              </ul>
            </Card>
          </>
        )}
      </div>
    </>
  );
}

function RecurringSkeleton() {
  return (
    <div aria-busy aria-label="Loading recurring bills">
      <PageHeaderSkeleton />
      <Skeleton className="h-20 rounded-xl" />
      <Skeleton className="mt-4 h-72 rounded-xl" />
    </div>
  );
}
