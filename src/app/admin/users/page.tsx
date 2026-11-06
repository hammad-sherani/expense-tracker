import { Ban, BadgeCheck, Clock, SearchX, UserPlus, Users } from "lucide-react";
import type { Metadata } from "next";
import Link from "next/link";
import { connection } from "next/server";
import { Suspense } from "react";
import { UserFilters } from "@/components/admin/user-filters";
import { PageHeaderSkeleton } from "@/components/dashboard/dashboard-skeleton";
import { Pagination } from "@/components/expenses/pagination";
import { initials } from "@/lib/initials";
import { EmptyState } from "@/components/shared/empty-state";
import { PendingContent } from "@/components/shared/navigation-transition";
import { PageHeader } from "@/components/shared/page-header";
import { Avatar, AvatarFallback } from "@/components/ui/avatar";
import { Card } from "@/components/ui/card";
import { Skeleton } from "@/components/ui/skeleton";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { requireAdmin } from "@/lib/auth/dal";
import { formatTimestamp } from "@/lib/dates";
import { cn } from "@/lib/utils";
import { listUsers, type UserStatusFilter } from "@/server/queries/users";

export const metadata: Metadata = { title: "Users" };

export default function AdminUsersPage({ searchParams }: PageProps<"/admin/users">) {
  return (
    <Suspense fallback={<UsersSkeleton />}>
      <UsersView searchParams={searchParams} />
    </Suspense>
  );
}

const first = (v: string | string[] | undefined) => (Array.isArray(v) ? v[0] : v);

function StatusBadge({ verified, blocked }: { verified: boolean; blocked: boolean }) {
  if (blocked) {
    return (
      <span className="inline-flex items-center gap-1 rounded-full bg-destructive/10 px-2 py-0.5 text-xs font-medium text-destructive">
        <Ban className="size-3.5" />
        Blocked
      </span>
    );
  }
  return (
    <span
      className={cn(
        "inline-flex items-center gap-1 rounded-full px-2 py-0.5 text-xs font-medium",
        verified ? "bg-success/10 text-success" : "bg-muted text-muted-foreground",
      )}
    >
      {verified ? <BadgeCheck className="size-3.5" /> : <Clock className="size-3.5" />}
      {verified ? "Verified" : "Pending"}
    </span>
  );
}

function Stat({ icon: Icon, label, value }: { icon: typeof Users; label: string; value: number }) {
  return (
    <Card className="flex-row items-center gap-4 px-5 py-4">
      <span className="flex size-10 items-center justify-center rounded-xl bg-muted text-muted-foreground">
        <Icon className="size-5" />
      </span>
      <div>
        <p className="text-xs font-medium text-muted-foreground">{label}</p>
        <p className="text-2xl font-semibold tracking-tight tabular-nums">{value.toLocaleString("en-PK")}</p>
      </div>
    </Card>
  );
}

async function UsersView({ searchParams }: { searchParams: PageProps<"/admin/users">["searchParams"] }) {
  await connection();
  await requireAdmin();
  const sp = await searchParams;
  const q = (first(sp.q) ?? "").trim().slice(0, 100);
  const rawStatus = first(sp.status);
  const status: UserStatusFilter =
    rawStatus === "verified" || rawStatus === "pending" || rawStatus === "blocked" ? rawStatus : "all";
  const page = Math.max(1, Number.parseInt(first(sp.page) ?? "1", 10) || 1);

  const result = await listUsers({ q, status, page });
  const { stats } = result;

  return (
    <>
      <PageHeader title="Users" description="Everyone who has signed up for Spendwise." />

      <PendingContent className="flex flex-col gap-4">
        <div className="grid gap-4 sm:grid-cols-2 xl:grid-cols-4">
          <Stat icon={Users} label="Total users" value={stats.totalUsers} />
          <Stat icon={BadgeCheck} label="Verified" value={stats.verifiedUsers} />
          <Stat icon={Clock} label="Pending verification" value={stats.pendingUsers} />
          <Stat icon={UserPlus} label="Joined this month" value={stats.newThisMonth} />
        </div>

        <UserFilters q={q} status={status} />

        <Card className="gap-0 py-0">
          {result.items.length === 0 ? (
            q || status !== "all" ? (
              <EmptyState icon={SearchX} title="No matching users" description="Try a different search or status filter." />
            ) : (
              <EmptyState icon={Users} title="No users yet" description="People who sign up will appear here." />
            )
          ) : (
            <>
              <div className="hidden md:block">
                <Table>
                  <TableHeader>
                    <TableRow className="hover:bg-transparent">
                      <TableHead className="pl-5">User</TableHead>
                      <TableHead>Email</TableHead>
                      <TableHead>Status</TableHead>
                      <TableHead className="pr-5 text-right">Joined</TableHead>
                    </TableRow>
                  </TableHeader>
                  <TableBody>
                    {result.items.map((u) => (
                      <TableRow key={u.id}>
                        <TableCell className="pl-5">
                          <div className="flex items-center gap-3">
                            <Avatar className="size-8">
                              <AvatarFallback className="bg-primary/10 text-xs font-semibold text-primary">
                                {initials(u.username)}
                              </AvatarFallback>
                            </Avatar>
                            <Link href={`/admin/users/${u.id}`} className="font-medium hover:underline">
                              {u.username}
                            </Link>
                          </div>
                        </TableCell>
                        <TableCell className="text-muted-foreground">{u.email}</TableCell>
                        <TableCell>
                          <StatusBadge verified={u.verified} blocked={u.blocked} />
                        </TableCell>
                        <TableCell className="pr-5 text-right whitespace-nowrap text-muted-foreground">
                          {formatTimestamp(u.createdAt)}
                        </TableCell>
                      </TableRow>
                    ))}
                  </TableBody>
                </Table>
              </div>
              <ul className="divide-y md:hidden">
                {result.items.map((u) => (
                  <li key={u.id} className="flex items-center gap-3 px-4 py-3">
                    <Avatar className="size-9">
                      <AvatarFallback className="bg-primary/10 text-xs font-semibold text-primary">
                        {initials(u.username)}
                      </AvatarFallback>
                    </Avatar>
                    <div className="min-w-0 flex-1">
                      <Link href={`/admin/users/${u.id}`} className="block truncate text-sm font-medium">
                        {u.username}
                      </Link>
                      <p className="truncate text-xs text-muted-foreground">{u.email}</p>
                    </div>
                    <StatusBadge verified={u.verified} blocked={u.blocked} />
                  </li>
                ))}
              </ul>
              <Pagination page={result.page} pageCount={result.pageCount} total={result.total} />
            </>
          )}
        </Card>
      </PendingContent>
    </>
  );
}

function UsersSkeleton() {
  return (
    <div aria-busy aria-label="Loading users">
      <PageHeaderSkeleton />
      <div className="grid gap-4 sm:grid-cols-2 xl:grid-cols-4">
        {Array.from({ length: 4 }, (_, i) => (
          <Card key={i} className="flex-row items-center gap-4 px-5 py-4">
            <Skeleton className="size-10 rounded-xl" />
            <div className="flex flex-col gap-2">
              <Skeleton className="h-3 w-20" />
              <Skeleton className="h-6 w-12" />
            </div>
          </Card>
        ))}
      </div>
      <Skeleton className="mt-4 h-8 w-full" />
      <Card className="mt-4 gap-0 py-0">
        {Array.from({ length: 6 }, (_, i) => (
          <div key={i} className="flex items-center gap-3 border-b px-5 py-3 last:border-0">
            <Skeleton className="size-8 rounded-full" />
            <Skeleton className="h-4 w-32" />
            <Skeleton className="h-4 flex-1" />
            <Skeleton className="h-5 w-20 rounded-full" />
          </div>
        ))}
      </Card>
    </div>
  );
}
