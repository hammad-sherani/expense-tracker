import { PiggyBank } from "lucide-react";
import type { Metadata } from "next";
import { connection } from "next/server";
import { Suspense } from "react";
import { AddCommitteeButton, CommitteeCard } from "@/components/committees/committee-ui";
import { PageHeaderSkeleton } from "@/components/dashboard/dashboard-skeleton";
import { EmptyState } from "@/components/shared/empty-state";
import { PageHeader } from "@/components/shared/page-header";
import { Card } from "@/components/ui/card";
import { Skeleton } from "@/components/ui/skeleton";
import { requireUser } from "@/lib/auth/dal";
import { formatCurrency, roundMoney } from "@/lib/format";
import { cn } from "@/lib/utils";
import { listCommittees } from "@/server/queries/committees";

export const metadata: Metadata = { title: "Committees" };

export default function CommitteesPage() {
  return (
    <Suspense fallback={<CommitteesSkeleton />}>
      <Committees />
    </Suspense>
  );
}

async function Committees() {
  await connection();
  const user = await requireUser();
  const all = await listCommittees(user.id);
  const active = all.filter((c) => !c.archived);
  const archived = all.filter((c) => c.archived);
  const running = active.filter((c) => c.remaining > 0);
  const monthly = roundMoney(running.reduce((a, c) => a + c.monthlyAmount, 0));
  const position = roundMoney(active.filter((c) => !c.forFriend).reduce((a, c) => a + c.position, 0));
  const shares = active.filter((c) => c.forFriend);
  const friendsOwe = roundMoney(shares.reduce((a, c) => a + c.friendOwes, 0));

  return (
    <>
      <PageHeader
        title="Committees"
        description="Monthly committees (BC). Payments are your savings, so they aren't counted as expenses."
        actions={<AddCommitteeButton />}
      />
      <div className="flex flex-col gap-6">
        {active.length === 0 && archived.length === 0 ? (
          <Card>
            <EmptyState
              icon={PiggyBank}
              title="No committees yet"
              description="Add your committee to track each monthly installment, your turn and the pot."
              action={<AddCommitteeButton label="Add your first committee" />}
            />
          </Card>
        ) : (
          <>
            <Card className={cn("grid grid-cols-2 gap-4 px-5 py-4", shares.length > 0 && "sm:grid-cols-3")}>
              <div>
                <p className="text-xs font-medium text-muted-foreground">Paid every month</p>
                <p className="mt-1 text-xl font-semibold tabular-nums">{formatCurrency(monthly)}</p>
              </div>
              <div>
                <p className="text-xs font-medium text-muted-foreground">{position < 0 ? "Still to pay back" : "Money in committees"}</p>
                <p className="mt-1 text-xl font-semibold tabular-nums">{formatCurrency(Math.abs(position))}</p>
              </div>
              {shares.length > 0 && (
                <div>
                  <p className="text-xs font-medium text-muted-foreground">{friendsOwe < 0 ? "Holding for friends" : "Friends owe you"}</p>
                  <p className="mt-1 text-xl font-semibold tabular-nums" data-testid="friends-owe">
                    {formatCurrency(Math.abs(friendsOwe))}
                  </p>
                </div>
              )}
            </Card>
            <div className="grid gap-4 lg:grid-cols-2">
              {active.map((c) => (
                <CommitteeCard key={c.id} committee={c} />
              ))}
            </div>
          </>
        )}
        {archived.length > 0 && (
          <section>
            <h2 className="mb-3 text-sm font-medium text-muted-foreground">Finished</h2>
            <div className="grid gap-4 lg:grid-cols-2">
              {archived.map((c) => (
                <CommitteeCard key={c.id} committee={c} />
              ))}
            </div>
          </section>
        )}
      </div>
    </>
  );
}

function CommitteesSkeleton() {
  return (
    <div aria-busy aria-label="Loading committees">
      <PageHeaderSkeleton />
      <Skeleton className="h-20 rounded-xl" />
      <div className="mt-6 grid gap-4 lg:grid-cols-2">
        <Skeleton className="h-64 rounded-xl" />
        <Skeleton className="h-64 rounded-xl" />
      </div>
    </div>
  );
}
