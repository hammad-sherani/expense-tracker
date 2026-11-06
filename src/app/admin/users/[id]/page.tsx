import { ArrowLeft, Ban, BadgeCheck, Clock } from "lucide-react";
import type { Metadata } from "next";
import Link from "next/link";
import { notFound } from "next/navigation";
import { connection } from "next/server";
import { Suspense } from "react";
import { UserActions } from "@/components/admin/admin-ui";
import { PageHeaderSkeleton } from "@/components/dashboard/dashboard-skeleton";
import { PageHeader } from "@/components/shared/page-header";
import { Avatar, AvatarFallback } from "@/components/ui/avatar";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Skeleton } from "@/components/ui/skeleton";
import { requireAdmin } from "@/lib/auth/dal";
import { formatTimestamp } from "@/lib/dates";
import { initials } from "@/lib/initials";
import { objectId } from "@/lib/validations/money";
import { getAdminUser } from "@/server/queries/admin";

export const metadata: Metadata = { title: "User" };

export default function AdminUserPage({ params }: PageProps<"/admin/users/[id]">) {
  return (
    <Suspense fallback={<UserSkeleton />}>
      <UserView params={params} />
    </Suspense>
  );
}

async function UserView({ params }: { params: PageProps<"/admin/users/[id]">["params"] }) {
  await connection();
  await requireAdmin();
  const { id } = await params;
  if (!objectId.safeParse(id).success) notFound();
  const user = await getAdminUser(id);
  if (!user) notFound();
  const counts = [
    ["Expenses", user.counts.expenses],
    ["Income entries", user.counts.incomes],
    ["Wallets", user.counts.wallets],
    ["Categories", user.counts.categories],
    ["Friends & family", user.counts.friends],
    ["Groups", user.counts.groups],
    ["Budgets", user.counts.budgets],
    ["Recurring bills", user.counts.recurring],
  ] as const;

  return (
    <>
      <Button asChild variant="ghost" size="sm" className="mb-1 -ml-2 w-fit text-muted-foreground">
        <Link href="/admin/users">
          <ArrowLeft />
          All users
        </Link>
      </Button>
      <PageHeader title={user.username} description={user.email} />
      <div className="grid max-w-4xl gap-4 lg:grid-cols-2">
        <Card>
          <CardHeader>
            <CardTitle className="flex items-center gap-3">
              <Avatar className="size-10">
                <AvatarFallback className="bg-primary/10 font-semibold text-primary">{initials(user.username)}</AvatarFallback>
              </Avatar>
              Account
            </CardTitle>
          </CardHeader>
          <CardContent className="flex flex-col gap-4">
            <dl className="grid grid-cols-[auto_1fr] gap-x-6 gap-y-2 text-sm">
              <dt className="text-muted-foreground">Status</dt>
              <dd className="flex items-center gap-1.5 font-medium">
                {user.blocked ? (
                  <>
                    <Ban className="size-4 text-destructive" /> Blocked
                  </>
                ) : user.verified ? (
                  <>
                    <BadgeCheck className="size-4 text-success" /> Verified
                  </>
                ) : (
                  <>
                    <Clock className="size-4 text-muted-foreground" /> Pending verification
                  </>
                )}
              </dd>
              <dt className="text-muted-foreground">Joined</dt>
              <dd>{formatTimestamp(user.createdAt)}</dd>
              <dt className="text-muted-foreground">Last active</dt>
              <dd>{user.lastActiveAt ? formatTimestamp(user.lastActiveAt) : "Never"}</dd>
              {user.blockedAt && (
                <>
                  <dt className="text-muted-foreground">Blocked on</dt>
                  <dd>{formatTimestamp(user.blockedAt)}</dd>
                </>
              )}
            </dl>
            <UserActions id={user.id} username={user.username} verified={user.verified} blocked={user.blocked} />
          </CardContent>
        </Card>
        <Card>
          <CardHeader>
            <CardTitle>Activity</CardTitle>
          </CardHeader>
          <CardContent>
            <p className="mb-3 text-xs text-muted-foreground">Number of records only. Amounts and details stay private.</p>
            <dl className="grid grid-cols-2 gap-3">
              {counts.map(([label, value]) => (
                <div key={label} className="rounded-lg bg-muted/50 px-3 py-2">
                  <dt className="text-xs text-muted-foreground">{label}</dt>
                  <dd className="text-lg font-semibold tabular-nums">{value.toLocaleString("en-PK")}</dd>
                </div>
              ))}
            </dl>
          </CardContent>
        </Card>
      </div>
    </>
  );
}

function UserSkeleton() {
  return (
    <div aria-busy aria-label="Loading user">
      <PageHeaderSkeleton />
      <div className="grid max-w-4xl gap-4 lg:grid-cols-2">
        <Skeleton className="h-64 rounded-xl" />
        <Skeleton className="h-64 rounded-xl" />
      </div>
    </div>
  );
}
