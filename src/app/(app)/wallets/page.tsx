import { Wallet } from "lucide-react";
import type { Metadata } from "next";
import { connection } from "next/server";
import { Suspense } from "react";
import { PageHeaderSkeleton } from "@/components/dashboard/dashboard-skeleton";
import { EmptyState } from "@/components/shared/empty-state";
import { PageHeader } from "@/components/shared/page-header";
import { Card } from "@/components/ui/card";
import { Skeleton } from "@/components/ui/skeleton";
import { WalletCard, WalletHeaderActions } from "@/components/wallets/wallet-cards";
import { requireUser } from "@/lib/auth/dal";
import { formatCurrency, roundMoney } from "@/lib/format";
import { listWallets } from "@/server/queries/lookups";

export const metadata: Metadata = { title: "Wallets" };

export default function WalletsPage() {
  return (
    <Suspense fallback={<WalletsSkeleton />}>
      <Wallets />
    </Suspense>
  );
}

async function Wallets() {
  await connection();
  const user = await requireUser();
  const wallets = await listWallets(user.id);
  const active = wallets.filter((w) => !w.archived);
  const archived = wallets.filter((w) => w.archived);
  const total = roundMoney(active.reduce((a, w) => a + w.balance, 0));

  return (
    <>
      <PageHeader
        title="Wallets"
        description="Where your money is: cash, bank accounts, JazzCash and cards."
        actions={<WalletHeaderActions />}
      />
      <div className="flex flex-col gap-6">
        <Card className="flex-row items-center justify-between gap-4 px-5 py-4">
          <div>
            <p className="text-sm font-medium text-muted-foreground">Total balance</p>
            <p className="mt-1 text-3xl font-semibold tracking-tight tabular-nums">{formatCurrency(total)}</p>
          </div>
          <p className="text-right text-xs text-muted-foreground">
            Across {active.length} wallet{active.length === 1 ? "" : "s"}
          </p>
        </Card>

        {active.length === 0 ? (
          <Card>
            <EmptyState icon={Wallet} title="No wallets yet" description="Add a wallet to see where your money is." />
          </Card>
        ) : (
          <div className="grid gap-4 sm:grid-cols-2 xl:grid-cols-3">
            {active.map((w) => (
              <WalletCard key={w.id} wallet={w} />
            ))}
          </div>
        )}

        {archived.length > 0 && (
          <section>
            <h2 className="mb-3 text-sm font-medium text-muted-foreground">Archived</h2>
            <div className="grid gap-4 sm:grid-cols-2 xl:grid-cols-3">
              {archived.map((w) => (
                <WalletCard key={w.id} wallet={w} />
              ))}
            </div>
          </section>
        )}

        <p className="text-xs text-muted-foreground">
          A balance is the starting balance plus income, minus expenses you paid (the whole bill for split expenses),
          plus or minus transfers and repayments recorded in that wallet.
        </p>
      </div>
    </>
  );
}

function WalletsSkeleton() {
  return (
    <div aria-busy aria-label="Loading wallets">
      <PageHeaderSkeleton />
      <Skeleton className="h-24 w-full rounded-xl" />
      <div className="mt-6 grid gap-4 sm:grid-cols-2 xl:grid-cols-3">
        {Array.from({ length: 3 }, (_, i) => (
          <Skeleton key={i} className="h-36 rounded-xl" />
        ))}
      </div>
    </div>
  );
}
