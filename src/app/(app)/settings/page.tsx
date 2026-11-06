import { ChevronRight, Tags } from "lucide-react";
import type { Metadata } from "next";
import Link from "next/link";
import { connection } from "next/server";
import { Suspense } from "react";
import { PageHeaderSkeleton } from "@/components/dashboard/dashboard-skeleton";
import { PageHeader } from "@/components/shared/page-header";
import {
  DeleteAccount,
  EmailForm,
  PasswordForm,
  ReportToggle,
  UsernameForm,
} from "@/components/settings/account-forms";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Skeleton } from "@/components/ui/skeleton";
import { requireUser } from "@/lib/auth/dal";
import { pendingEmailChange } from "@/lib/auth/otp";
import { db } from "@/lib/db";
import { formatTimestamp } from "@/lib/dates";

export const metadata: Metadata = { title: "Settings" };

export default function SettingsPage() {
  return (
    <Suspense fallback={<SettingsSkeleton />}>
      <Settings />
    </Suspense>
  );
}

function Section({ title, description, children }: { title: string; description?: string; children: React.ReactNode }) {
  return (
    <Card>
      <CardHeader>
        <CardTitle>{title}</CardTitle>
        {description && <CardDescription>{description}</CardDescription>}
      </CardHeader>
      <CardContent>{children}</CardContent>
    </Card>
  );
}

async function Settings() {
  await connection();
  const me = await requireUser();
  const [user, pendingEmail, categoryCount] = await Promise.all([
    db.user.findUniqueOrThrow({
      where: { id: me.id },
      select: { username: true, email: true, createdAt: true, monthlyReportEmail: true },
    }),
    pendingEmailChange(me.id),
    db.category.count({ where: { userId: me.id, OR: [{ archivedAt: null }, { archivedAt: { isSet: false } }] } }),
  ]);

  return (
    <>
      <PageHeader title="Settings" description={`Signed in as ${user.username} · member since ${formatTimestamp(user.createdAt).split(",")[0]}`} />
      <div className="flex max-w-3xl flex-col gap-4">
        <Section title="Profile">
          <UsernameForm username={user.username} />
        </Section>

        <Section title="Email" description="The address you log in with. We'll send a code to confirm a new one.">
          <EmailForm email={user.email} pendingEmail={pendingEmail} />
        </Section>

        <Section title="Password">
          <PasswordForm />
        </Section>

        <Card className="py-0">
          <Link href="/settings/categories" className="flex items-center gap-3 px-6 py-5 hover:bg-muted/40">
            <span className="flex size-9 items-center justify-center rounded-lg bg-primary/10 text-primary">
              <Tags className="size-4" />
            </span>
            <span className="flex-1">
              <span className="block font-medium">Categories</span>
              <span className="block text-sm text-muted-foreground">
                {categoryCount} active · add your own, rename, recolour or archive
              </span>
            </span>
            <ChevronRight className="size-4 text-muted-foreground" />
          </Link>
        </Card>

        <Section title="Notifications">
          <ReportToggle enabled={Boolean(user.monthlyReportEmail)} />
        </Section>

        <Section title="Danger zone" description="Permanently delete your account and all of its data.">
          <DeleteAccount />
        </Section>
      </div>
    </>
  );
}

function SettingsSkeleton() {
  return (
    <div aria-busy aria-label="Loading settings">
      <PageHeaderSkeleton />
      <div className="flex max-w-3xl flex-col gap-4">
        {Array.from({ length: 4 }, (_, i) => (
          <Skeleton key={i} className="h-36 rounded-xl" />
        ))}
      </div>
    </div>
  );
}
