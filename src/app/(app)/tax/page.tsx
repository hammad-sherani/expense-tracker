import type { Metadata } from "next";
import Link from "next/link";
import { connection } from "next/server";
import { Suspense } from "react";
import { PageHeaderSkeleton } from "@/components/dashboard/dashboard-skeleton";
import { PageHeader } from "@/components/shared/page-header";
import { DeadlinesCard, DeductionsCard, TaxEstimateCard, WithholdingCard } from "@/components/tax/tax-ui";
import { Button } from "@/components/ui/button";
import { Skeleton } from "@/components/ui/skeleton";
import { requireUser } from "@/lib/auth/dal";
import { taxYearLabel } from "@/lib/tax-year";
import { getTaxYearData } from "@/server/queries/tax";
import { listDeadlines } from "@/server/tax-deadlines";

export const metadata: Metadata = { title: "Tax" };

export default function TaxPage({ searchParams }: PageProps<"/tax">) {
  return (
    <Suspense fallback={<TaxSkeleton />}>
      <Tax searchParams={searchParams} />
    </Suspense>
  );
}

async function Tax({ searchParams }: { searchParams: PageProps<"/tax">["searchParams"] }) {
  await connection();
  const user = await requireUser();
  const sp = await searchParams;
  const requested = Number(Array.isArray(sp.ty) ? sp.ty[0] : sp.ty) || undefined;
  const [data, deadlines] = await Promise.all([getTaxYearData(user.id, requested), listDeadlines(user.id)]);

  return (
    <>
      <PageHeader
        title="Tax"
        description={`Income tax for salaried income, tax already deducted, deductions and filing dates. ${taxYearLabel(data.taxYear)}.`}
      />
      {data.years.length > 1 && (
        <nav className="-mt-2 mb-4 flex flex-wrap gap-2" aria-label="Tax year">
          {data.years.map((y) => (
            <Button key={y} asChild size="sm" variant={y === data.taxYear ? "default" : "outline"}>
              <Link href={y === data.currentTaxYear ? "/tax" : `/tax?ty=${y}`} aria-current={y === data.taxYear ? "page" : undefined}>
                {taxYearLabel(y, true)}
              </Link>
            </Button>
          ))}
        </nav>
      )}
      <div className="flex flex-col gap-4">
        {/* Keyed by year so the editable projection resets when switching years. */}
        <TaxEstimateCard key={data.taxYear} data={data} />
        <div className="grid gap-4 lg:grid-cols-2">
          <WithholdingCard data={data} />
          <DeductionsCard data={data} />
        </div>
        <DeadlinesCard deadlines={deadlines} />
      </div>
    </>
  );
}

function TaxSkeleton() {
  return (
    <div aria-busy aria-label="Loading tax">
      <PageHeaderSkeleton />
      <Skeleton className="h-72 rounded-xl" />
      <div className="mt-4 grid gap-4 lg:grid-cols-2">
        <Skeleton className="h-56 rounded-xl" />
        <Skeleton className="h-56 rounded-xl" />
      </div>
    </div>
  );
}
