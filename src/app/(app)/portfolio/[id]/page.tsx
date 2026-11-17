import { ArrowLeft, Receipt, TriangleAlert } from "lucide-react";
import type { Metadata } from "next";
import Link from "next/link";
import { notFound } from "next/navigation";
import { connection } from "next/server";
import { Suspense } from "react";
import { PageHeaderSkeleton } from "@/components/dashboard/dashboard-skeleton";
import { HoldingButtons, PriceChart, PriceList, TxnList } from "@/components/portfolio/portfolio-ui";
import { EmptyState } from "@/components/shared/empty-state";
import { PageHeader } from "@/components/shared/page-header";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Skeleton } from "@/components/ui/skeleton";
import { requireUser } from "@/lib/auth/dal";
import { formatCurrency } from "@/lib/format";
import { ASSET_META, perUnit, unitsLabel } from "@/lib/portfolio";
import { cn } from "@/lib/utils";
import { objectId } from "@/lib/validations/money";
import { getHolding } from "@/server/queries/portfolio";

export const metadata: Metadata = { title: "Investment" };

export default function HoldingPage({ params }: PageProps<"/portfolio/[id]">) {
  return (
    <Suspense fallback={<HoldingSkeleton />}>
      <HoldingView params={params} />
    </Suspense>
  );
}

const signed = (n: number) => `${n > 0 ? "+" : ""}${formatCurrency(n)}`;
const tone = (n: number) => (n > 0 ? "text-success" : n < 0 ? "text-destructive" : "");

function Stat({ label, value, sub, valueClass }: { label: string; value: string; sub?: string; valueClass?: string }) {
  return (
    <Card className="gap-1 px-5 py-4">
      <p className="text-xs font-medium text-muted-foreground">{label}</p>
      <p className={cn("truncate text-xl font-semibold tracking-tight tabular-nums", valueClass)}>{value}</p>
      {sub && <p className="truncate text-xs text-muted-foreground">{sub}</p>}
    </Card>
  );
}

async function HoldingView({ params }: { params: PageProps<"/portfolio/[id]">["params"] }) {
  await connection();
  const user = await requireUser();
  const { id } = await params;
  if (!objectId.safeParse(id).success) notFound();
  const data = await getHolding(user.id, id);
  if (!data) notFound();
  const { holding: h, txns, prices, history } = data;

  return (
    <>
      <Button asChild variant="ghost" size="sm" className="mb-1 -ml-2 w-fit text-muted-foreground">
        <Link href="/portfolio">
          <ArrowLeft />
          Portfolio
        </Link>
      </Button>
      <PageHeader
        title={h.name}
        description={`${ASSET_META[h.type].label}${h.archived ? " · closed" : ""}${h.notes ? ` · ${h.notes}` : ""}`}
        actions={<HoldingButtons holding={h} />}
      />
      <div className="flex flex-col gap-4">
        <div className="grid grid-cols-2 gap-4 xl:grid-cols-4">
          <Stat label="Current value" value={formatCurrency(h.value)} sub={unitsLabel(h.units, h.unit)} />
          <Stat
            label="Invested"
            value={formatCurrency(h.cost)}
            sub={h.units > 0 ? `avg ${formatCurrency(h.avgCost)} ${perUnit(h.unit)}` : "Nothing held"}
          />
          <Stat
            label="Profit / loss"
            value={signed(h.unrealized)}
            valueClass={tone(h.unrealized)}
            sub={h.returnPct === null ? "On what you hold" : `${h.returnPct > 0 ? "+" : ""}${h.returnPct.toFixed(1)}% return`}
          />
          <Stat
            label="Total gain"
            value={signed(h.totalGain)}
            valueClass={tone(h.totalGain)}
            sub={`${formatCurrency(h.realized)} sales · ${formatCurrency(h.dividends)} dividends`}
          />
        </div>

        <Card className="gap-1 px-5 py-4">
          <p className="text-xs font-medium text-muted-foreground">Current price {perUnit(h.unit)}</p>
          <p className="text-xl font-semibold tabular-nums">
            {h.currentPrice === null ? "—" : formatCurrency(h.currentPrice)}
          </p>
          <p className="flex items-center gap-1.5 text-xs text-muted-foreground">
            {h.priceStale && <TriangleAlert className="size-3.5 text-warning" />}
            {h.priceNote}
            {h.priceStale && " · may be out of date, please update it"}
          </p>
        </Card>

        <div className="grid gap-4 lg:grid-cols-3">
          <div className="flex min-w-0 flex-col gap-4 lg:col-span-2">
            <Card className="min-w-0">
              <CardHeader>
                <CardTitle>Price history</CardTitle>
                <CardDescription>Dashed line is what you paid on average</CardDescription>
              </CardHeader>
              <CardContent className="pr-2 pl-0">
                {history.length < 2 ? (
                  <p className="px-6 py-10 text-center text-sm text-muted-foreground">
                    The chart appears once there are prices on at least two different days.
                  </p>
                ) : (
                  <PriceChart data={history} avgCost={h.avgCost} />
                )}
              </CardContent>
            </Card>
            <Card className="gap-0 py-0">
              {txns.length === 0 ? (
                <EmptyState icon={Receipt} title="No transactions yet" description="Record your first purchase with Buy." />
              ) : (
                <TxnList txns={txns} holding={h} />
              )}
            </Card>
          </div>
          <Card className="min-w-0 self-start">
            <CardHeader>
              <CardTitle>Prices you entered</CardTitle>
              <CardDescription>Latest {prices.length ? "first" : "prices appear here"}</CardDescription>
            </CardHeader>
            <CardContent>
              {prices.length === 0 ? (
                <p className="text-sm text-muted-foreground">
                  {h.autoPrice ? "This one updates automatically." : "Use Update price whenever you check the NAV."}
                </p>
              ) : (
                <PriceList prices={prices} />
              )}
            </CardContent>
          </Card>
        </div>
      </div>
    </>
  );
}

function HoldingSkeleton() {
  return (
    <div aria-busy aria-label="Loading investment">
      <PageHeaderSkeleton />
      <div className="grid grid-cols-2 gap-4 xl:grid-cols-4">
        {Array.from({ length: 4 }, (_, i) => (
          <Skeleton key={i} className="h-20 rounded-xl" />
        ))}
      </div>
      <Skeleton className="mt-4 h-80 rounded-xl" />
    </div>
  );
}
