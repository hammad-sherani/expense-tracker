import { History } from "lucide-react";
import Link from "next/link";
import { EmptyState } from "@/components/shared/empty-state";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { RemoveTransferButton } from "@/components/wallets/remove-transfer-button";
import { formatExpenseDate } from "@/lib/dates";
import { formatCurrency } from "@/lib/format";
import { cn } from "@/lib/utils";
import { ACTIVITY_LIMIT, type WalletActivity } from "@/server/queries/wallets";

type Props = {
  rows: WalletActivity[];
  /** Starting balance of the wallet(s), shown as the first row once the whole history fits. */
  openingBalance: number;
  /** Pass to show a Wallet column (history of several wallets). */
  wallets?: Map<string, { name: string; color: string }>;
  /** Transfers can be removed from a single wallet's page. */
  removableTransfers?: boolean;
};

/** Money in and out as a statement: date, details, in, out and the balance after each row. */
export function WalletHistoryTable({ rows, openingBalance, wallets, removableTransfers }: Props) {
  if (rows.length === 0) {
    return (
      <EmptyState
        icon={History}
        title="No activity yet"
        description="Expenses, income, transfers and repayments recorded in this wallet show up here."
      />
    );
  }
  const complete = rows.length < ACTIVITY_LIMIT;
  const numeric = "text-right tabular-nums";

  return (
    <Table>
      <TableHeader>
        <TableRow className="hover:bg-transparent">
          <TableHead className="pl-4 sm:pl-5">Date</TableHead>
          <TableHead>Details</TableHead>
          {wallets && <TableHead>Wallet</TableHead>}
          <TableHead className="text-right">In</TableHead>
          <TableHead className="text-right">Out</TableHead>
          <TableHead className={cn("text-right", !removableTransfers && "pr-4 sm:pr-5")}>Balance</TableHead>
          {removableTransfers && <TableHead className="w-10 pr-4 sm:pr-5"><span className="sr-only">Actions</span></TableHead>}
        </TableRow>
      </TableHeader>
      <TableBody>
        {rows.map((a) => {
          const wallet = wallets?.get(a.walletId);
          return (
            <TableRow key={a.id}>
              <TableCell className="pl-4 text-muted-foreground sm:pl-5">{formatExpenseDate(a.date)}</TableCell>
              <TableCell className="max-w-72 min-w-44 whitespace-normal">
                <p className="font-medium">{a.title}</p>
                <p className="text-xs text-muted-foreground">{a.subtitle}</p>
              </TableCell>
              {wallets && (
                <TableCell>
                  {wallet ? (
                    <Link href={`/wallets/${a.walletId}`} className="inline-flex items-center gap-1.5 hover:underline">
                      <span className="size-2 rounded-full" style={{ backgroundColor: wallet.color }} aria-hidden />
                      {wallet.name}
                    </Link>
                  ) : (
                    "—"
                  )}
                </TableCell>
              )}
              <TableCell className={cn(numeric, "text-success")}>{a.amount > 0 ? formatCurrency(a.amount) : ""}</TableCell>
              <TableCell className={numeric}>{a.amount < 0 ? formatCurrency(-a.amount) : a.amount === 0 ? formatCurrency(0) : ""}</TableCell>
              <TableCell
                className={cn(numeric, "font-medium", a.balanceAfter < 0 && "text-destructive", !removableTransfers && "pr-4 sm:pr-5")}
              >
                {formatCurrency(a.balanceAfter)}
              </TableCell>
              {removableTransfers && (
                <TableCell className="pr-4 sm:pr-5">
                  {a.transferId && <RemoveTransferButton id={a.transferId} />}
                  {a.adjustmentId && <RemoveTransferButton id={a.adjustmentId} kind="adjustment" />}
                </TableCell>
              )}
            </TableRow>
          );
        })}
        {complete && (
          <TableRow className="bg-muted/40 hover:bg-muted/40">
            <TableCell className="pl-4 text-muted-foreground sm:pl-5">—</TableCell>
            <TableCell className="font-medium" colSpan={wallets ? 4 : 3}>
              Starting balance
            </TableCell>
            <TableCell className={cn(numeric, "font-medium", openingBalance < 0 && "text-destructive", !removableTransfers && "pr-4 sm:pr-5")}>
              {formatCurrency(openingBalance)}
            </TableCell>
            {removableTransfers && <TableCell />}
          </TableRow>
        )}
      </TableBody>
    </Table>
  );
}
