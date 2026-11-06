import { ArrowDownLeft, ArrowUpRight, HandCoins, Scale } from "lucide-react";
import type { Metadata } from "next";
import { connection } from "next/server";
import { Suspense } from "react";
import { PageHeaderSkeleton } from "@/components/dashboard/dashboard-skeleton";
import { AddDueButton } from "@/components/dues/add-due-button";
import { DuesFilters } from "@/components/dues/dues-filters";
import { FriendDuesCard } from "@/components/dues/friend-dues-card";
import { ManageFriendsDialog } from "@/components/dues/manage-friends-dialog";
import { EmptyState } from "@/components/shared/empty-state";
import { PendingContent } from "@/components/shared/navigation-transition";
import { PageHeader } from "@/components/shared/page-header";
import { Card } from "@/components/ui/card";
import { Skeleton } from "@/components/ui/skeleton";
import { requireUser } from "@/lib/auth/dal";
import { formatCurrency } from "@/lib/format";
import { cn } from "@/lib/utils";
import { type DueStatusFilter, getDuesSummary, listDuesByFriend } from "@/server/queries/dues";
import { listFriends } from "@/server/queries/friends";

export const metadata: Metadata = { title: "Dues" };

export default function DuesPage({ searchParams }: PageProps<"/dues">) {
  return (
    <Suspense fallback={<DuesSkeleton />}>
      <DuesView searchParams={searchParams} />
    </Suspense>
  );
}

const first = (v: string | string[] | undefined) => (Array.isArray(v) ? v[0] : v);

function SummaryCard({
  icon: Icon,
  label,
  value,
  hint,
  tone,
}: {
  icon: typeof Scale;
  label: string;
  value: number;
  hint: string;
  tone: "positive" | "negative" | "neutral";
}) {
  return (
    <Card className="gap-2 px-5 py-5">
      <div className="flex items-center justify-between">
        <p className="text-sm font-medium text-muted-foreground">{label}</p>
        <span
          className={cn(
            "flex size-8 items-center justify-center rounded-lg",
            tone === "positive" && "bg-success/10 text-success",
            tone === "negative" && "bg-destructive/10 text-destructive",
            tone === "neutral" && "bg-muted text-muted-foreground",
          )}
        >
          <Icon className="size-4" />
        </span>
      </div>
      <p className="text-2xl font-semibold tracking-tight tabular-nums">{formatCurrency(value)}</p>
      <p className="text-xs text-muted-foreground">{hint}</p>
    </Card>
  );
}

async function DuesView({ searchParams }: { searchParams: PageProps<"/dues">["searchParams"] }) {
  await connection();
  const user = await requireUser();
  const sp = await searchParams;
  const dir = first(sp.dir) === "owe" ? "owe" : "owed";
  const rawStatus = first(sp.status);
  const status: DueStatusFilter = rawStatus === "settled" || rawStatus === "all" ? rawStatus : "pending";
  const direction = dir === "owe" ? "I_OWE" : "OWED_TO_ME";

  const [summary, groups, friends] = await Promise.all([
    getDuesSummary(user.id),
    listDuesByFriend(user.id, direction, status),
    listFriends(user.id),
  ]);

  const netPositive = summary.net >= 0;

  return (
    <>
      <PageHeader
        title="Dues"
        description="Money friends & family owe you, and money you owe them."
        actions={
          <>
            <ManageFriendsDialog friends={friends} />
            <AddDueButton />
          </>
        }
      />

      <PendingContent className="flex flex-col gap-4">
        <div className="grid gap-4 sm:grid-cols-3">
          <SummaryCard
            icon={ArrowDownLeft}
            label="Owed to you"
            value={summary.owedToMe}
            hint={
              summary.friendsOwing
                ? `${summary.friendsOwing} ${summary.friendsOwing === 1 ? "person" : "people"} to collect from`
                : "Nobody owes you right now"
            }
            tone="positive"
          />
          <SummaryCard
            icon={ArrowUpRight}
            label="You owe"
            value={summary.iOwe}
            hint={summary.iOwe ? "Pay back when you can" : "You're all clear"}
            tone="negative"
          />
          <SummaryCard
            icon={Scale}
            label="Net balance"
            value={Math.abs(summary.net)}
            hint={summary.net === 0 ? "Even with everyone" : netPositive ? "In your favour overall" : "You owe more than you're owed"}
            tone={summary.net === 0 ? "neutral" : netPositive ? "positive" : "negative"}
          />
        </div>

        <DuesFilters dir={dir} status={status} />

        {groups.length === 0 ? (
          <Card>
            <EmptyState
              icon={HandCoins}
              title={
                status === "pending"
                  ? dir === "owed"
                    ? "Nobody owes you anything"
                    : "You don't owe anyone"
                  : "Nothing here yet"
              }
              description="Split a bill when adding an expense, or use “Add due” for something you paid fully for someone else."
            />
          </Card>
        ) : (
          <div className="flex flex-col gap-3">
            {groups.map((g) => (
              <FriendDuesCard key={g.friend.id} group={g} direction={direction} />
            ))}
          </div>
        )}
      </PendingContent>
    </>
  );
}

function DuesSkeleton() {
  return (
    <div aria-busy aria-label="Loading dues">
      <PageHeaderSkeleton />
      <div className="grid gap-4 sm:grid-cols-3">
        {Array.from({ length: 3 }, (_, i) => (
          <Card key={i} className="gap-3 px-5 py-5">
            <Skeleton className="h-4 w-24" />
            <Skeleton className="h-7 w-32" />
            <Skeleton className="h-3 w-40" />
          </Card>
        ))}
      </div>
      <Skeleton className="mt-4 h-8 w-72" />
      <div className="mt-4 flex flex-col gap-3">
        {Array.from({ length: 3 }, (_, i) => (
          <Card key={i} className="flex-row items-center gap-3 px-5 py-4">
            <Skeleton className="size-10 rounded-full" />
            <Skeleton className="h-4 flex-1" />
            <Skeleton className="h-6 w-24" />
          </Card>
        ))}
      </div>
    </div>
  );
}
