import { TrendingUp, TriangleAlert } from "lucide-react";
import type { Metadata } from "next";
import Link from "next/link";
import { after, connection } from "next/server";
import { Suspense } from "react";
import { PageHeaderSkeleton } from "@/components/dashboard/dashboard-skeleton";
import { AddInvestmentButton, HoldingActions, NetWorthChart } from "@/components/portfolio/portfolio-ui";
import { EmptyState } from "@/components/shared/empty-state";
import { PageHeader } from "@/components/shared/page-header";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Skeleton } from "@/components/ui/skeleton";
import { requireUser } from "@/lib/auth/dal";
import { formatCurrency } from "@/lib/format";
import { ASSET_META, unitsLabel } from "@/lib/portfolio";
import { cn } from "@/lib/utils";
import { currentYearMonth } from "@/lib/dates";
import { saveNetWorthSnapshot } from "@/server/net-worth-snapshot";
import { listNetWorthHistory, type NetWorth, type NetWorthPoint } from "@/server/queries/net-worth";
import { type AllocationRow, getPortfolio, type HoldingDTO } from "@/server/queries/portfolio";

export const metadata: Metadata = { title: "Portfolio" };

export default function PortfolioPage() {
  return (
    <Suspense fallback={<PortfolioSkeleton />}>
      <Portfolio />
    </Suspense>
  );
}

const signed = (n: number) => `${n > 0 ? "+" : ""}${formatCurrency(n)}`;
const tone = (n: number) => (n > 0 ? "text-success" : n < 0 ? "text-destructive" : "text-muted-foreground");
const pctText = (p: number | null) => (p === null ? "" : ` (${p > 0 ? "+" : ""}${p.toFixed(1)}%)`);

function Stat({ label, value, sub, valueClass }: { label: string; value: string; sub?: string; valueClass?: string }) {
  return (
    <Card className="gap-1 px-5 py-4">
      <p className="text-xs font-medium text-muted-foreground">{label}</p>
      <p className={cn("truncate text-xl font-semibold tracking-tight tabular-nums", valueClass)}>{value}</p>
      {sub && <p className="truncate text-xs text-muted-foreground">{sub}</p>}
    </Card>
  );
}

function HoldingRow({ h }: { h: HoldingDTO }) {
  return (
    <li className="relative flex items-center gap-3 px-4 py-3.5 transition-colors hover:bg-muted/30 sm:px-5">
      <div className="min-w-0 flex-1">
        <Link href={`/portfolio/${h.id}`} className="block truncate text-sm font-medium after:absolute after:inset-0">
          {h.name}
        </Link>
        <p className="truncate text-xs text-muted-foreground">
          {ASSET_META[h.type].label}
          {h.units > 0 ? ` · ${unitsLabel(h.units, h.unit)} · avg ${formatCurrency(h.avgCost)}` : " · sold out"}
        </p>
        {h.units > 0 && h.currentPrice !== null && (
          <p className="flex items-center gap-1 truncate text-xs text-muted-foreground">
            {h.priceStale && <TriangleAlert className="size-3 shrink-0 text-warning" aria-label="Price may be out of date" />}
            <span className="truncate">
              {formatCurrency(h.currentPrice)} · {h.priceNote}
            </span>
          </p>
        )}
      </div>
      <div className="shrink-0 text-right">
        <p className="text-sm font-semibold tabular-nums">{formatCurrency(h.value)}</p>
        {h.units > 0 ? (
          <p className={cn("text-xs font-medium tabular-nums", tone(h.unrealized))}>
            {signed(h.unrealized)}
            <span className="hidden sm:inline">{pctText(h.returnPct)}</span>
          </p>
        ) : (
          <p className={cn("text-xs font-medium tabular-nums", tone(h.totalGain))}>{signed(h.totalGain)} earned</p>
        )}
      </div>
      <div className="relative z-10">
        <HoldingActions holding={h} />
      </div>
    </li>
  );
}

function NetWorthCard({ n, history }: { n: NetWorth; history: NetWorthPoint[] }) {
  const { year, month } = currentYearMonth();
  const key = `${year}-${String(month).padStart(2, "0")}`;
  // The current month always shows today's value; earlier months keep their saved month-end value.
  const past = history.filter((h) => h.month < key);
  const label = new Date(Date.UTC(year, month - 1, 1)).toLocaleDateString("en-GB", { month: "short", year: "2-digit", timeZone: "UTC" });
  const points = [...past, { month: key, label, total: n.total }];
  const prev = past.at(-1);
  const change = prev ? n.total - prev.total : null;
  const parts = [
    ["Wallets", n.cash],
    ["Investments", n.investments],
    ...(n.hasCommittees ? [["Committees", n.committees] as const] : []),
    ...(n.hasGoals ? [["Goals", n.goals] as const] : []),
    ["Owed to you", n.owedToMe],
    ["You owe", -n.iOwe],
    ...(n.hasLoans ? [["Loans", -n.loans] as const] : []),
  ] as const;
  return (
    <Card className="gap-3 px-5 py-4">
      <div className="flex flex-wrap items-end justify-between gap-x-4 gap-y-1">
        <div>
          <p className="text-sm font-medium text-muted-foreground">Net worth</p>
          <p className="mt-1 text-3xl font-semibold tracking-tight tabular-nums" data-testid="net-worth-total">
            {formatCurrency(n.total)}
          </p>
        </div>
        {change !== null && (
          <p className="text-sm text-muted-foreground" data-testid="net-worth-change">
            <span className={cn("font-medium tabular-nums", tone(change))}>{signed(Math.round(change * 100) / 100)}</span> since end of{" "}
            {prev!.label}
          </p>
        )}
      </div>
      <dl className="grid grid-cols-2 gap-3 text-sm sm:grid-cols-4 xl:grid-cols-8">
        {parts.map(([label, v]) => (
          <div key={label}>
            <dt className="text-xs text-muted-foreground">{label}</dt>
            <dd className="font-medium tabular-nums">{formatCurrency(v)}</dd>
          </div>
        ))}
      </dl>
      {points.length >= 2 ? (
        <NetWorthChart data={points} />
      ) : (
        <p className="border-t pt-3 text-xs text-muted-foreground">
          Your net worth is saved each month from now on, so a growth chart appears here from next month.
        </p>
      )}
    </Card>
  );
}

function AllocationBars({ rows }: { rows: AllocationRow[] }) {
  return (
    <ul className="flex flex-col gap-3">
      {rows.map((r) => (
        <li key={r.key}>
          <div className="flex items-baseline justify-between gap-2 text-sm">
            <span className="truncate font-medium">{r.label}</span>
            <span className="shrink-0 text-xs text-muted-foreground tabular-nums">{r.percent.toFixed(1)}%</span>
          </div>
          <div className="mt-1.5 h-1.5 overflow-hidden rounded-full bg-muted">
            <div className="h-full rounded-full bg-primary" style={{ width: `${Math.max(2, r.percent)}%` }} />
          </div>
        </li>
      ))}
    </ul>
  );
}

async function Portfolio() {
  await connection();
  const user = await requireUser();
  const [p, history] = await Promise.all([getPortfolio(user.id), listNetWorthHistory(user.id)]);
  after(() => saveNetWorthSnapshot(user.id, p.netWorth).catch((e) => console.error("net worth snapshot failed", e)));
  const t = p.totals;
  const n = p.netWorth;
  const showByType = p.byType.length > 1 && p.byHolding.length > p.byType.length;

  return (
    <>
      <PageHeader
        title="Portfolio"
        description="Your investments: what you put in, what it's worth now, and your profit or loss."
        actions={<AddInvestmentButton />}
      />
      <div className="flex flex-col gap-4">
        <NetWorthCard n={n} history={history} />
        {p.holdings.length === 0 && p.closed.length === 0 ? (
          <Card>
            <EmptyState
              icon={TrendingUp}
              title="No investments yet"
              description="Add your mutual fund, silver or gold to see how they're doing. Investments don't count as expenses."
              action={<AddInvestmentButton label="Add your first investment" />}
            />
          </Card>
        ) : (
          <>

            <div className="grid grid-cols-2 gap-4 xl:grid-cols-4">
              <Stat label="Current value" value={formatCurrency(t.value)} />
              <Stat label="Invested" value={formatCurrency(t.invested)} sub="Cost of what you still hold" />
              <Stat
                label="Profit / loss"
                value={signed(t.unrealized)}
                valueClass={tone(t.unrealized)}
                sub={t.returnPct === null ? "On what you still hold" : `${t.returnPct > 0 ? "+" : ""}${t.returnPct.toFixed(1)}% return`}
              />
              <Stat
                label="Earned so far"
                value={signed(t.realized + t.dividends)}
                valueClass={tone(t.realized + t.dividends)}
                sub={`${formatCurrency(t.realized)} from sales · ${formatCurrency(t.dividends)} dividends`}
              />
            </div>

            <div className="grid gap-4 lg:grid-cols-3">
              <Card className="min-w-0 gap-0 self-start py-0 lg:col-span-2">
                {p.holdings.length === 0 ? (
                  <p className="px-5 py-8 text-center text-sm text-muted-foreground">No open investments.</p>
                ) : (
                  <ul className="divide-y" aria-label="Holdings">
                    {p.holdings.map((h) => (
                      <HoldingRow key={h.id} h={h} />
                    ))}
                  </ul>
                )}
              </Card>
              <Card className="min-w-0 self-start">
                <CardHeader>
                  <CardTitle>Allocation</CardTitle>
                  <CardDescription>Share of your portfolio by current value</CardDescription>
                </CardHeader>
                <CardContent className="flex flex-col gap-5">
                  {p.byHolding.length === 0 ? (
                    <p className="text-sm text-muted-foreground">Nothing held right now.</p>
                  ) : (
                    <AllocationBars rows={p.byHolding} />
                  )}
                  {showByType && (
                    <div className="border-t pt-4">
                      <p className="mb-3 text-xs font-medium text-muted-foreground">By type</p>
                      <AllocationBars rows={p.byType} />
                    </div>
                  )}
                </CardContent>
              </Card>
            </div>

            {p.closed.length > 0 && (
              <section>
                <h2 className="mb-3 text-sm font-medium text-muted-foreground">Closed investments</h2>
                <Card className="gap-0 py-0">
                  <ul className="divide-y" aria-label="Closed investments">
                    {p.closed.map((h) => (
                      <HoldingRow key={h.id} h={h} />
                    ))}
                  </ul>
                </Card>
              </section>
            )}
            <p className="text-xs text-muted-foreground">
              Silver and gold rates are international rates converted to rupees and can differ from your local market. Buying
              and selling here isn&apos;t counted as expenses or income.
            </p>
          </>
        )}
      </div>
    </>
  );
}

function PortfolioSkeleton() {
  return (
    <div aria-busy aria-label="Loading portfolio">
      <PageHeaderSkeleton />
      <Skeleton className="h-28 rounded-xl" />
      <div className="mt-4 grid grid-cols-2 gap-4 xl:grid-cols-4">
        {Array.from({ length: 4 }, (_, i) => (
          <Skeleton key={i} className="h-20 rounded-xl" />
        ))}
      </div>
      <Skeleton className="mt-4 h-64 rounded-xl" />
    </div>
  );
}
