import { ArrowLeft, ArrowRight, BadgeCheck, ReceiptText } from "lucide-react";
import type { Metadata } from "next";
import Link from "next/link";
import { notFound } from "next/navigation";
import { connection } from "next/server";
import { Suspense } from "react";
import { PageHeaderSkeleton } from "@/components/dashboard/dashboard-skeleton";
import { GroupExpenseList } from "@/components/groups/group-expense-list";
import { AddGroupExpenseButton, GroupMenu } from "@/components/groups/group-ui";
import { EmptyState } from "@/components/shared/empty-state";
import { PageHeader } from "@/components/shared/page-header";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Skeleton } from "@/components/ui/skeleton";
import { requireUser } from "@/lib/auth/dal";
import { formatCurrency } from "@/lib/format";
import { cn } from "@/lib/utils";
import { objectId } from "@/lib/validations/money";
import { getGroup, ME } from "@/server/queries/groups";

export const metadata: Metadata = { title: "Group" };

export default function GroupPage({ params }: PageProps<"/groups/[id]">) {
  return (
    <Suspense fallback={<GroupSkeleton />}>
      <GroupView params={params} />
    </Suspense>
  );
}

async function GroupView({ params }: { params: PageProps<"/groups/[id]">["params"] }) {
  await connection();
  const user = await requireUser();
  const { id } = await params;
  if (!objectId.safeParse(id).success) notFound();
  const group = await getGroup(user.id, id);
  if (!group) notFound();
  const editable = {
    id: group.id,
    name: group.name,
    emoji: group.emoji,
    memberIds: group.memberIds,
    members: group.members.filter((m) => m.id !== ME && group.memberIds.includes(m.id)).map((m) => ({ id: m.id, name: m.name })),
  };

  return (
    <>
      <Button asChild variant="ghost" size="sm" className="mb-1 -ml-2 w-fit text-muted-foreground">
        <Link href="/groups">
          <ArrowLeft />
          All groups
        </Link>
      </Button>
      <PageHeader
        title={`${group.emoji ?? ""} ${group.name}`.trim()}
        description={`You${group.memberNames.length ? `, ${group.memberNames.join(", ")}` : ""} · ${group.expenseCount} bill${group.expenseCount === 1 ? "" : "s"} · ${formatCurrency(group.total)} total`}
        actions={
          <>
            <GroupMenu group={editable} archived={group.archived} />
            {!group.archived && <AddGroupExpenseButton groupId={group.id} memberIds={group.memberIds} name={group.name} />}
          </>
        }
      />
      <div className="grid gap-4 lg:grid-cols-3">
        <div className="flex min-w-0 flex-col gap-4 lg:col-span-1">
          <Card>
            <CardHeader>
              <CardTitle>Settle up</CardTitle>
              <CardDescription>The fewest payments that make everyone even.</CardDescription>
            </CardHeader>
            <CardContent>
              {group.plan.length === 0 ? (
                <p className="flex items-center gap-2 text-sm text-success">
                  <BadgeCheck className="size-4" />
                  {group.expenseCount ? "Everyone is even." : "Add bills to see who owes whom."}
                </p>
              ) : (
                <ul className="flex flex-col gap-2" aria-label="Settle up plan">
                  {group.plan.map((t) => {
                    const involvesMe = t.from === ME || t.to === ME;
                    return (
                      <li
                        key={`${t.from}-${t.to}`}
                        className={cn("flex items-center gap-2 rounded-lg px-3 py-2 text-sm", involvesMe ? "bg-primary/10" : "bg-muted/60")}
                      >
                        <span className="min-w-0 flex-1 truncate">
                          <span className="font-medium">{t.fromName}</span>
                          <ArrowRight className="mx-1 inline size-3.5 text-muted-foreground" />
                          <span className="font-medium">{t.toName}</span>
                        </span>
                        <span className="font-semibold tabular-nums">{formatCurrency(t.amount)}</span>
                      </li>
                    );
                  })}
                </ul>
              )}
              {group.plan.length > 0 && (
                <p className="mt-3 text-xs text-muted-foreground">
                  Your own dues with each person are on the{" "}
                  <Link href="/dues" className="font-medium text-primary hover:underline">
                    Dues page
                  </Link>
                  , where you record payments. Payments between other people are just shown here.
                </p>
              )}
            </CardContent>
          </Card>
          <Card>
            <CardHeader>
              <CardTitle>Balances</CardTitle>
              <CardDescription>Paid minus their share of the bills.</CardDescription>
            </CardHeader>
            <CardContent>
              <ul className="flex flex-col gap-2.5" aria-label="Member balances">
                {group.members.map((m) => (
                  <li key={m.id} className="flex items-center justify-between gap-3 text-sm">
                    <span className="min-w-0">
                      <span className="block truncate font-medium">{m.name}</span>
                      <span className="block text-xs text-muted-foreground tabular-nums">
                        paid {formatCurrency(m.paid)} · share {formatCurrency(m.share)}
                      </span>
                    </span>
                    <span
                      className={cn(
                        "shrink-0 font-semibold tabular-nums",
                        m.balance > 0 ? "text-success" : m.balance < 0 ? "text-destructive" : "text-muted-foreground",
                      )}
                    >
                      {m.balance > 0 ? "+" : ""}
                      {formatCurrency(m.balance)}
                    </span>
                  </li>
                ))}
              </ul>
            </CardContent>
          </Card>
        </div>
        <Card className="min-w-0 gap-0 self-start py-0 lg:col-span-2">
          {group.expenses.length === 0 ? (
            <EmptyState
              icon={ReceiptText}
              title="No bills yet"
              description="Add the trip's bills as you go: hotel, fuel, food. Pick who paid and split it."
            />
          ) : (
            <GroupExpenseList expenses={group.expenses} />
          )}
        </Card>
      </div>
    </>
  );
}

function GroupSkeleton() {
  return (
    <div aria-busy aria-label="Loading group">
      <PageHeaderSkeleton />
      <div className="grid gap-4 lg:grid-cols-3">
        <Skeleton className="h-64 rounded-xl" />
        <Skeleton className="h-64 rounded-xl lg:col-span-2" />
      </div>
    </div>
  );
}
