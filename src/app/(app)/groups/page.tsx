import { Users } from "lucide-react";
import type { Metadata } from "next";
import Link from "next/link";
import { connection } from "next/server";
import { Suspense } from "react";
import { PageHeaderSkeleton } from "@/components/dashboard/dashboard-skeleton";
import { AddGroupButton } from "@/components/groups/group-ui";
import { EmptyState } from "@/components/shared/empty-state";
import { PageHeader } from "@/components/shared/page-header";
import { Card } from "@/components/ui/card";
import { Skeleton } from "@/components/ui/skeleton";
import { requireUser } from "@/lib/auth/dal";
import { formatCurrency } from "@/lib/format";
import { cn } from "@/lib/utils";
import { type GroupSummary, listGroups } from "@/server/queries/groups";

export const metadata: Metadata = { title: "Groups" };

export default function GroupsPage() {
  return (
    <Suspense fallback={<GroupsSkeleton />}>
      <Groups />
    </Suspense>
  );
}

function GroupCard({ g }: { g: GroupSummary }) {
  return (
    <Card className={cn("relative gap-3 px-5 py-4 transition-colors hover:bg-muted/30", g.archived && "opacity-70")}>
      <div className="flex items-center gap-3">
        <span className="flex size-10 shrink-0 items-center justify-center rounded-xl bg-muted text-xl" aria-hidden>
          {g.emoji ?? "👥"}
        </span>
        <div className="min-w-0 flex-1">
          <Link href={`/groups/${g.id}`} className="block truncate font-medium after:absolute after:inset-0">
            {g.name}
          </Link>
          <p className="truncate text-xs text-muted-foreground">
            You{g.memberNames.length ? `, ${g.memberNames.join(", ")}` : ""}
          </p>
        </div>
      </div>
      <div className="flex items-end justify-between gap-2">
        <div>
          <p className="text-xs text-muted-foreground">
            {g.expenseCount} bill{g.expenseCount === 1 ? "" : "s"} · total
          </p>
          <p className="font-semibold tabular-nums">{formatCurrency(g.total)}</p>
        </div>
        <p
          className={cn(
            "text-right text-sm font-medium tabular-nums",
            g.myBalance > 0 ? "text-success" : g.myBalance < 0 ? "text-destructive" : "text-muted-foreground",
          )}
        >
          {g.myBalance > 0
            ? `You get back ${formatCurrency(g.myBalance)}`
            : g.myBalance < 0
              ? `You owe ${formatCurrency(-g.myBalance)}`
              : "You're even"}
        </p>
      </div>
    </Card>
  );
}

async function Groups() {
  await connection();
  const user = await requireUser();
  const groups = await listGroups(user.id);
  const active = groups.filter((g) => !g.archived);
  const archived = groups.filter((g) => g.archived);

  return (
    <>
      <PageHeader
        title="Groups"
        description="Trips and groups that share many bills. See who paid what and who owes whom."
        actions={<AddGroupButton />}
      />
      <div className="flex flex-col gap-6">
        {active.length === 0 ? (
          <Card>
            <EmptyState
              icon={Users}
              title="No groups yet"
              description="Make a group for a trip or your flatmates, add the bills as you go, and settle up at the end."
              action={<AddGroupButton label="Create a group" />}
            />
          </Card>
        ) : (
          <div className="grid gap-4 sm:grid-cols-2 xl:grid-cols-3">
            {active.map((g) => (
              <GroupCard key={g.id} g={g} />
            ))}
          </div>
        )}
        {archived.length > 0 && (
          <section>
            <h2 className="mb-3 text-sm font-medium text-muted-foreground">Archived</h2>
            <div className="grid gap-4 sm:grid-cols-2 xl:grid-cols-3">
              {archived.map((g) => (
                <GroupCard key={g.id} g={g} />
              ))}
            </div>
          </section>
        )}
      </div>
    </>
  );
}

function GroupsSkeleton() {
  return (
    <div aria-busy aria-label="Loading groups">
      <PageHeaderSkeleton />
      <div className="grid gap-4 sm:grid-cols-2 xl:grid-cols-3">
        {Array.from({ length: 3 }, (_, i) => (
          <Skeleton key={i} className="h-32 rounded-xl" />
        ))}
      </div>
    </div>
  );
}
