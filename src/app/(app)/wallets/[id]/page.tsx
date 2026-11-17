import { ArrowLeft } from "lucide-react";
import type { Metadata } from "next";
import Link from "next/link";
import { notFound } from "next/navigation";
import { connection } from "next/server";
import { Suspense } from "react";
import { PageHeaderSkeleton } from "@/components/dashboard/dashboard-skeleton";
import { PageHeader } from "@/components/shared/page-header";
import { Button } from "@/components/ui/button";
import { Card } from "@/components/ui/card";
import { Skeleton } from "@/components/ui/skeleton";
import { WalletMenu } from "@/components/wallets/wallet-cards";
import { WalletHistoryTable } from "@/components/wallets/wallet-history";
import { requireUser } from "@/lib/auth/dal";
import { formatCurrency } from "@/lib/format";
import { cn } from "@/lib/utils";
import { objectId } from "@/lib/validations/money";
import { WALLET_TYPE_META } from "@/lib/wallets";
import { listWallets } from "@/server/queries/lookups";
import { ACTIVITY_LIMIT, getWalletActivity } from "@/server/queries/wallets";

export const metadata: Metadata = { title: "Wallet" };

export default function WalletPage({ params }: PageProps<"/wallets/[id]">) {
  return (
    <Suspense fallback={<WalletSkeleton />}>
      <WalletView params={params} />
    </Suspense>
  );
}

async function WalletView({ params }: { params: PageProps<"/wallets/[id]">["params"] }) {
  await connection();
  const user = await requireUser();
  const { id } = await params;
  if (!objectId.safeParse(id).success) notFound();
  const wallets = await listWallets(user.id);
  const wallet = wallets.find((w) => w.id === id);
  if (!wallet) notFound();
  const activity = await getWalletActivity(user.id, [id], wallet.balance);
  const meta = WALLET_TYPE_META[wallet.type];
  const Icon = meta.icon;
  const moneyIn = activity.filter((a) => a.amount > 0).reduce((s, a) => s + a.amount, 0);
  const moneyOut = activity.filter((a) => a.amount < 0).reduce((s, a) => s - a.amount, 0);

  return (
    <>
      <Button asChild variant="ghost" size="sm" className="mb-1 -ml-2 w-fit text-muted-foreground">
        <Link href="/wallets">
          <ArrowLeft />
          All wallets
        </Link>
      </Button>
      <PageHeader
        title={wallet.name}
        description={wallet.archived ? `${meta.label} · archived` : meta.label}
        actions={<WalletMenu wallet={wallet} />}
      />
      <div className="flex flex-col gap-4">
        <div className="grid gap-4 sm:grid-cols-3">
          <Card className="flex-row items-center gap-3 px-5 py-4">
            <span
              className="flex size-10 shrink-0 items-center justify-center rounded-xl"
              style={{ backgroundColor: `${wallet.color}1f`, color: wallet.color }}
              aria-hidden
            >
              <Icon className="size-5" />
            </span>
            <div>
              <p className="text-xs font-medium text-muted-foreground">Balance</p>
              <p className={cn("text-xl font-semibold tabular-nums", wallet.balance < 0 && "text-destructive")}>
                {formatCurrency(wallet.balance)}
              </p>
            </div>
          </Card>
          <Card className="gap-1 px-5 py-4">
            <p className="text-xs font-medium text-muted-foreground">Money in</p>
            <p className="text-xl font-semibold text-success tabular-nums">{formatCurrency(moneyIn)}</p>
          </Card>
          <Card className="gap-1 px-5 py-4">
            <p className="text-xs font-medium text-muted-foreground">Money out</p>
            <p className="text-xl font-semibold tabular-nums">{formatCurrency(moneyOut)}</p>
          </Card>
        </div>

        <Card className="min-w-0 gap-0 py-0">
          <WalletHistoryTable rows={activity} openingBalance={wallet.openingBalance} removableTransfers />
        </Card>
        <p className="text-xs text-muted-foreground">
          Balance is what was in this wallet right after each entry. Starting balance {formatCurrency(wallet.openingBalance)}.
          {activity.length >= ACTIVITY_LIMIT && ` Shows the latest ${ACTIVITY_LIMIT} entries.`}
        </p>
      </div>
    </>
  );
}

function WalletSkeleton() {
  return (
    <div aria-busy aria-label="Loading wallet">
      <PageHeaderSkeleton />
      <div className="grid gap-4 sm:grid-cols-3">
        {Array.from({ length: 3 }, (_, i) => (
          <Skeleton key={i} className="h-20 rounded-xl" />
        ))}
      </div>
      <Skeleton className="mt-4 h-80 rounded-xl" />
    </div>
  );
}
