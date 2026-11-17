import { CreditCard, Landmark } from "lucide-react";
import type { Metadata } from "next";
import Link from "next/link";
import { connection } from "next/server";
import { Suspense } from "react";
import { PageHeaderSkeleton } from "@/components/dashboard/dashboard-skeleton";
import { AddLoanButton, LoanCard } from "@/components/loans/loan-ui";
import { EmptyState } from "@/components/shared/empty-state";
import { PageHeader } from "@/components/shared/page-header";
import { Card } from "@/components/ui/card";
import { Skeleton } from "@/components/ui/skeleton";
import { requireUser } from "@/lib/auth/dal";
import { formatExpenseDate, todayUTC } from "@/lib/dates";
import { formatCurrency, roundMoney } from "@/lib/format";
import { cn } from "@/lib/utils";
import { listLoans, totalLoanBalance } from "@/server/queries/loans";
import { listWallets } from "@/server/queries/lookups";
import type { WalletDTO } from "@/types";

export const metadata: Metadata = { title: "Loans & cards" };

export default function LoansPage() {
  return (
    <Suspense fallback={<LoansSkeleton />}>
      <Loans />
    </Suspense>
  );
}

/** Next date the card bill is due, from its due day (clamped to the month's length). */
function nextCardDue(dueDay: number, today: Date) {
  const at = (y: number, m: number) => new Date(Date.UTC(y, m, Math.min(dueDay, new Date(Date.UTC(y, m + 1, 0)).getUTCDate())));
  const y = today.getUTCFullYear();
  const m = today.getUTCMonth();
  const thisMonth = at(y, m);
  return thisMonth >= today ? thisMonth : at(y, m + 1);
}

function CardRow({ card, today }: { card: WalletDTO; today: Date }) {
  const used = Math.max(0, -card.balance);
  const limit = card.creditLimit;
  const percent = limit ? Math.min(100, (used / limit) * 100) : 0;
  return (
    <li className="flex flex-col gap-2 py-3 first:pt-0 last:pb-0" data-testid="card-row">
      <div className="flex items-baseline justify-between gap-3">
        <Link href={`/wallets/${card.id}`} className="truncate font-medium hover:underline">
          {card.name}
        </Link>
        <span className="text-sm font-medium tabular-nums">
          {formatCurrency(used)} used{limit ? <span className="font-normal text-muted-foreground"> of {formatCurrency(limit)}</span> : null}
        </span>
      </div>
      {limit ? (
        <div
          className="h-2 overflow-hidden rounded-full bg-muted"
          role="progressbar"
          aria-label={`${card.name} limit used`}
          aria-valuemin={0}
          aria-valuemax={100}
          aria-valuenow={Math.round(percent)}
        >
          <div className={cn("h-full rounded-full", percent >= 80 ? "bg-destructive" : "bg-primary")} style={{ width: `${percent}%` }} />
        </div>
      ) : null}
      <p className="text-xs text-muted-foreground">
        {[
          limit ? `${formatCurrency(Math.max(0, limit - used))} available` : "Add a credit limit by editing the wallet",
          card.dueDay ? `Bill due ${formatExpenseDate(nextCardDue(card.dueDay, today), { day: "numeric", month: "short" })}` : null,
          card.balance > 0 ? `${formatCurrency(card.balance)} in credit` : null,
        ]
          .filter(Boolean)
          .join(" · ")}
      </p>
    </li>
  );
}

async function Loans() {
  await connection();
  const user = await requireUser();
  const [all, wallets] = await Promise.all([listLoans(user.id), listWallets(user.id)]);
  const today = todayUTC();
  const active = all.filter((l) => !l.archived);
  const archived = all.filter((l) => l.archived);
  const cards = wallets.filter((w) => w.type === "CARD" && !w.archived);
  const owed = totalLoanBalance(all);
  const monthly = roundMoney(active.filter((l) => !l.finished).reduce((a, l) => a + l.monthlyInstallment, 0));
  const cardDebt = roundMoney(cards.reduce((a, c) => a + Math.max(0, -c.balance), 0));

  return (
    <>
      <PageHeader
        title="Loans & cards"
        description="What you've borrowed. Paying back the loan amount isn't spending; the interest is."
        actions={<AddLoanButton />}
      />
      <div className="flex flex-col gap-6">
        {(active.length > 0 || cards.length > 0) && (
          <Card className="grid grid-cols-2 gap-4 px-5 py-4 sm:grid-cols-3">
            <div>
              <p className="text-xs font-medium text-muted-foreground">Still owed on loans</p>
              <p className="mt-1 text-xl font-semibold tabular-nums" data-testid="loans-owed">
                {formatCurrency(owed)}
              </p>
            </div>
            <div>
              <p className="text-xs font-medium text-muted-foreground">Installments a month</p>
              <p className="mt-1 text-xl font-semibold tabular-nums">{formatCurrency(monthly)}</p>
            </div>
            {cards.length > 0 && (
              <div>
                <p className="text-xs font-medium text-muted-foreground">Used on cards</p>
                <p className="mt-1 text-xl font-semibold tabular-nums">{formatCurrency(cardDebt)}</p>
              </div>
            )}
          </Card>
        )}

        {active.length === 0 && archived.length === 0 ? (
          <Card>
            <EmptyState
              icon={Landmark}
              title="No loans"
              description="Add a bank, car or family loan to track each installment, the interest and when it'll be paid off."
              action={<AddLoanButton label="Add a loan" />}
            />
          </Card>
        ) : (
          active.length > 0 && (
            <div className="grid gap-4 lg:grid-cols-2">
              {active.map((l) => (
                <LoanCard key={l.id} loan={l} />
              ))}
            </div>
          )
        )}

        <section aria-labelledby="cards-heading">
          <h2 id="cards-heading" className="mb-3 text-sm font-medium text-muted-foreground">
            Credit cards
          </h2>
          <Card className="px-5 py-4">
            {cards.length === 0 ? (
              <p className="flex items-center gap-2 text-sm text-muted-foreground">
                <CreditCard className="size-4 shrink-0" />
                <span>
                  Add a wallet of type Card on the{" "}
                  <Link href="/wallets" className="font-medium text-foreground underline-offset-4 hover:underline">
                    Wallets
                  </Link>{" "}
                  page to see what&apos;s used against its limit here.
                </span>
              </p>
            ) : (
              <ul className="flex flex-col divide-y">
                {cards.map((c) => (
                  <CardRow key={c.id} card={c} today={today} />
                ))}
              </ul>
            )}
          </Card>
        </section>

        {archived.length > 0 && (
          <section>
            <h2 className="mb-3 text-sm font-medium text-muted-foreground">Paid off</h2>
            <div className="grid gap-4 lg:grid-cols-2">
              {archived.map((l) => (
                <LoanCard key={l.id} loan={l} />
              ))}
            </div>
          </section>
        )}
      </div>
    </>
  );
}

function LoansSkeleton() {
  return (
    <div aria-busy aria-label="Loading loans">
      <PageHeaderSkeleton />
      <Skeleton className="h-20 rounded-xl" />
      <div className="mt-6 grid gap-4 lg:grid-cols-2">
        <Skeleton className="h-64 rounded-xl" />
        <Skeleton className="h-64 rounded-xl" />
      </div>
    </div>
  );
}
