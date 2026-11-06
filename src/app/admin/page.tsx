import { Activity, Ban, BadgeCheck, Clock, ReceiptText, UserPlus, Users } from "lucide-react";
import type { Metadata } from "next";
import { connection } from "next/server";
import { Suspense } from "react";
import { SignupsChart } from "@/components/admin/admin-ui";
import { PageHeaderSkeleton } from "@/components/dashboard/dashboard-skeleton";
import { PageHeader } from "@/components/shared/page-header";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Skeleton } from "@/components/ui/skeleton";
import { requireAdmin } from "@/lib/auth/dal";
import { getAdminOverview } from "@/server/queries/admin";

export const metadata: Metadata = { title: "Admin overview" };

export default function AdminOverviewPage() {
  return (
    <Suspense fallback={<OverviewSkeleton />}>
      <Overview />
    </Suspense>
  );
}

function Stat({ icon: Icon, label, value, hint }: { icon: typeof Users; label: string; value: number; hint?: string }) {
  return (
    <Card className="flex-row items-center gap-4 px-5 py-4">
      <span className="flex size-10 shrink-0 items-center justify-center rounded-xl bg-muted text-muted-foreground">
        <Icon className="size-5" />
      </span>
      <div className="min-w-0">
        <p className="text-xs font-medium text-muted-foreground">{label}</p>
        <p className="text-2xl font-semibold tracking-tight tabular-nums">{value.toLocaleString("en-PK")}</p>
        {hint && <p className="truncate text-xs text-muted-foreground">{hint}</p>}
      </div>
    </Card>
  );
}

async function Overview() {
  await connection();
  await requireAdmin();
  const o = await getAdminOverview();
  const pct = (n: number) => (o.users.total ? `${Math.round((n / o.users.total) * 100)}% of users` : undefined);

  return (
    <>
      <PageHeader title="Overview" description="How Spendwise is being used. Counts only; nobody's amounts are shown." />
      <div className="flex flex-col gap-4">
        <div className="grid gap-4 sm:grid-cols-2 xl:grid-cols-4">
          <Stat icon={Users} label="Users" value={o.users.total} />
          <Stat icon={BadgeCheck} label="Verified" value={o.users.verified} hint={pct(o.users.verified)} />
          <Stat icon={Clock} label="Unverified" value={o.users.unverified} hint={pct(o.users.unverified)} />
          <Stat icon={Ban} label="Blocked" value={o.users.blocked} />
        </div>
        <div className="grid gap-4 lg:grid-cols-3">
          <Card className="min-w-0 lg:col-span-2">
            <CardHeader>
              <CardTitle>New signups</CardTitle>
              <CardDescription>Last 30 days · {o.signups30} total</CardDescription>
            </CardHeader>
            <CardContent className="pl-0">
              <SignupsChart data={o.signups} />
            </CardContent>
          </Card>
          <div className="flex flex-col gap-4">
            <Stat icon={Activity} label="Active in the last 7 days" value={o.users.active7} hint={pct(o.users.active7)} />
            <Stat icon={UserPlus} label="Active in the last 30 days" value={o.users.active30} hint={pct(o.users.active30)} />
            <Stat
              icon={ReceiptText}
              label="Entries recorded"
              value={o.entries.expenses + o.entries.incomes}
              hint={`${o.entries.expenses.toLocaleString("en-PK")} expenses · ${o.entries.incomes.toLocaleString("en-PK")} income`}
            />
          </div>
        </div>
      </div>
    </>
  );
}

function OverviewSkeleton() {
  return (
    <div aria-busy aria-label="Loading overview">
      <PageHeaderSkeleton />
      <div className="grid gap-4 sm:grid-cols-2 xl:grid-cols-4">
        {Array.from({ length: 4 }, (_, i) => (
          <Skeleton key={i} className="h-20 rounded-xl" />
        ))}
      </div>
      <Skeleton className="mt-4 h-72 rounded-xl" />
    </div>
  );
}
