"use client";

import {
  Archive,
  ArchiveRestore,
  ArrowDownToLine,
  ArrowUpFromLine,
  Coins,
  LineChart as LineChartIcon,
  Loader2,
  MoreVertical,
  Pencil,
  Plus,
  Trash2,
} from "lucide-react";
import { useRouter } from "next/navigation";
import { useState, useTransition } from "react";
import { CartesianGrid, Line, LineChart, ReferenceLine, ResponsiveContainer, Tooltip, XAxis, YAxis } from "recharts";
import { toast } from "sonner";
import { ChartTooltipCard } from "@/components/dashboard/chart-tooltip";
import { InvestmentDialog, PriceDialog, TxnDialog } from "@/components/portfolio/portfolio-dialogs";
import {
  AlertDialog,
  AlertDialogAction,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
} from "@/components/ui/alert-dialog";
import { Button } from "@/components/ui/button";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import { formatExpenseDate } from "@/lib/dates";
import { formatCurrency, formatCurrencyCompact } from "@/lib/format";
import { type TxnTypeValue, unitsLabel } from "@/lib/portfolio";
import { cn } from "@/lib/utils";
import { deleteInvestment, deletePrice, deleteTxn, setInvestmentArchived } from "@/server/actions/portfolio";
import type { HoldingDTO, PricePoint, PriceRowDTO, TxnDTO } from "@/server/queries/portfolio";

type Result = { ok: boolean; error?: string; message?: string };

function useRun() {
  const [isPending, startTransition] = useTransition();
  const run = (fn: () => Promise<Result>, after?: () => void) =>
    startTransition(async () => {
      const r = await fn();
      if (r.ok) {
        toast.success(r.message);
        after?.();
      } else toast.error(r.error);
    });
  return { isPending, run };
}

export function AddInvestmentButton({ label = "Add investment" }: { label?: string }) {
  const [open, setOpen] = useState(false);
  return (
    <>
      <Button onClick={() => setOpen(true)}>
        <Plus />
        {label}
      </Button>
      <InvestmentDialog open={open} onOpenChange={setOpen} />
    </>
  );
}

/** Buy / Sell / Dividend / Update price menu for one holding. */
export function HoldingActions({ holding }: { holding: HoldingDTO }) {
  const [txn, setTxn] = useState<TxnTypeValue | null>(null);
  const [lastType, setLastType] = useState<TxnTypeValue>("BUY");
  const [pricing, setPricing] = useState(false);
  const openTxn = (t: TxnTypeValue) => {
    setLastType(t);
    setTxn(t);
  };
  return (
    <>
      <DropdownMenu>
        <DropdownMenuTrigger asChild>
          <Button variant="ghost" size="icon-sm" aria-label={`Actions for ${holding.name}`}>
            <MoreVertical />
          </Button>
        </DropdownMenuTrigger>
        <DropdownMenuContent align="end">
          <DropdownMenuItem onSelect={() => openTxn("BUY")}>
            <ArrowDownToLine />
            Buy more
          </DropdownMenuItem>
          <DropdownMenuItem disabled={holding.units <= 0} onSelect={() => openTxn("SELL")}>
            <ArrowUpFromLine />
            Sell
          </DropdownMenuItem>
          <DropdownMenuItem onSelect={() => openTxn("DIVIDEND")}>
            <Coins />
            Add dividend
          </DropdownMenuItem>
          <DropdownMenuSeparator />
          <DropdownMenuItem onSelect={() => setPricing(true)}>
            <LineChartIcon />
            Update price
          </DropdownMenuItem>
        </DropdownMenuContent>
      </DropdownMenu>
      <TxnDialog open={txn !== null} onOpenChange={(o) => !o && setTxn(null)} holding={holding} type={txn ?? lastType} />
      <PriceDialog open={pricing} onOpenChange={setPricing} holding={holding} />
    </>
  );
}

/** Buttons on a holding's own page. */
export function HoldingButtons({ holding }: { holding: HoldingDTO }) {
  const [txn, setTxn] = useState<TxnTypeValue | null>(null);
  const [lastType, setLastType] = useState<TxnTypeValue>("BUY");
  const [pricing, setPricing] = useState(false);
  const [editing, setEditing] = useState(false);
  const [deleting, setDeleting] = useState(false);
  const { isPending, run } = useRun();
  const router = useRouter();
  const openTxn = (t: TxnTypeValue) => {
    setLastType(t);
    setTxn(t);
  };
  return (
    <>
      {!holding.archived && (
        <>
          <Button onClick={() => openTxn("BUY")}>
            <ArrowDownToLine />
            Buy
          </Button>
          <Button variant="outline" disabled={holding.units <= 0} onClick={() => openTxn("SELL")}>
            <ArrowUpFromLine />
            Sell
          </Button>
          <Button variant="outline" onClick={() => openTxn("DIVIDEND")}>
            <Coins />
            Dividend
          </Button>
          <Button variant="outline" onClick={() => setPricing(true)}>
            <LineChartIcon />
            Update price
          </Button>
        </>
      )}
      <DropdownMenu>
        <DropdownMenuTrigger asChild>
          <Button variant="outline" size="icon" aria-label={`Options for ${holding.name}`} disabled={isPending}>
            {isPending ? <Loader2 className="animate-spin" /> : <MoreVertical />}
          </Button>
        </DropdownMenuTrigger>
        <DropdownMenuContent align="end">
          <DropdownMenuItem onSelect={() => setEditing(true)}>
            <Pencil />
            Edit
          </DropdownMenuItem>
          <DropdownMenuItem onSelect={() => run(() => setInvestmentArchived(holding.id, !holding.archived))}>
            {holding.archived ? <ArchiveRestore /> : <Archive />}
            {holding.archived ? "Restore" : "Archive"}
          </DropdownMenuItem>
          <DropdownMenuSeparator />
          <DropdownMenuItem variant="destructive" onSelect={() => setDeleting(true)}>
            <Trash2 />
            Delete
          </DropdownMenuItem>
        </DropdownMenuContent>
      </DropdownMenu>

      <TxnDialog open={txn !== null} onOpenChange={(o) => !o && setTxn(null)} holding={holding} type={txn ?? lastType} />
      <PriceDialog open={pricing} onOpenChange={setPricing} holding={holding} />
      <InvestmentDialog open={editing} onOpenChange={setEditing} holding={holding} />
      <AlertDialog open={deleting} onOpenChange={(o) => !isPending && setDeleting(o)}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>Delete {holding.name}?</AlertDialogTitle>
            <AlertDialogDescription>
              This removes it and all {holding.txnCount} of its transactions, as if it never happened. Any wallet balances
              it changed go back too. If you sold it, archive it instead to keep the history.
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel disabled={isPending}>Cancel</AlertDialogCancel>
            <AlertDialogAction
              variant="destructive"
              disabled={isPending}
              onClick={(e) => {
                e.preventDefault();
                run(() => deleteInvestment(holding.id), () => router.push("/portfolio"));
              }}
            >
              {isPending && <Loader2 className="animate-spin" />}
              Delete
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </>
  );
}

const TXN_LABEL: Record<TxnTypeValue, string> = { BUY: "Bought", SELL: "Sold", DIVIDEND: "Dividend" };

function TxnRow({ txn, holding }: { txn: TxnDTO; holding: HoldingDTO }) {
  const [editing, setEditing] = useState(false);
  const [deleting, setDeleting] = useState(false);
  const { isPending, run } = useRun();
  const out = txn.type === "BUY";
  const title =
    txn.type === "DIVIDEND" ? "Dividend" : `${TXN_LABEL[txn.type]} ${unitsLabel(txn.units, holding.unit)}`;
  return (
    <li className="flex items-center gap-3 px-4 py-3 sm:px-5">
      <span
        className={cn(
          "flex size-8 shrink-0 items-center justify-center rounded-lg",
          out ? "bg-muted text-muted-foreground" : "bg-success/10 text-success",
        )}
        aria-hidden
      >
        {txn.type === "BUY" ? (
          <ArrowDownToLine className="size-4" />
        ) : txn.type === "SELL" ? (
          <ArrowUpFromLine className="size-4" />
        ) : (
          <Coins className="size-4" />
        )}
      </span>
      <div className="min-w-0 flex-1">
        <p className="truncate text-sm font-medium">{title}</p>
        <p className="truncate text-xs text-muted-foreground">
          {formatExpenseDate(txn.date)}
          {txn.type !== "DIVIDEND" && ` · @ ${formatCurrency(txn.price)}`}
          {txn.fees > 0 && ` · fees ${formatCurrency(txn.fees)}`}
          {txn.wallet && ` · ${txn.wallet.name}`}
          {txn.note && ` · ${txn.note}`}
        </p>
      </div>
      <span className={cn("shrink-0 text-sm font-semibold tabular-nums", !out && "text-success")}>
        {out ? "−" : "+"}
        {formatCurrency(txn.amount)}
      </span>
      <DropdownMenu>
        <DropdownMenuTrigger asChild>
          <Button variant="ghost" size="icon-sm" aria-label={`Options for ${title}`} disabled={isPending}>
            {isPending ? <Loader2 className="animate-spin" /> : <MoreVertical />}
          </Button>
        </DropdownMenuTrigger>
        <DropdownMenuContent align="end">
          <DropdownMenuItem onSelect={() => setEditing(true)}>
            <Pencil />
            Edit
          </DropdownMenuItem>
          <DropdownMenuItem variant="destructive" onSelect={() => setDeleting(true)}>
            <Trash2 />
            Delete
          </DropdownMenuItem>
        </DropdownMenuContent>
      </DropdownMenu>
      <TxnDialog open={editing} onOpenChange={setEditing} holding={holding} type={txn.type} txn={txn} />
      <AlertDialog open={deleting} onOpenChange={(o) => !isPending && setDeleting(o)}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>Delete this transaction?</AlertDialogTitle>
            <AlertDialogDescription>
              {`${title} on ${formatExpenseDate(txn.date)} will be removed${txn.wallet ? `, and ${txn.wallet.name}'s balance goes back` : ""}.`}
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel disabled={isPending}>Cancel</AlertDialogCancel>
            <AlertDialogAction
              variant="destructive"
              disabled={isPending}
              onClick={(e) => {
                e.preventDefault();
                run(() => deleteTxn(txn.id), () => setDeleting(false));
              }}
            >
              {isPending && <Loader2 className="animate-spin" />}
              Delete
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </li>
  );
}

export function TxnList({ txns, holding }: { txns: TxnDTO[]; holding: HoldingDTO }) {
  return (
    <ul className="divide-y" aria-label="Transactions">
      {txns.map((t) => (
        <TxnRow key={t.id} txn={t} holding={holding} />
      ))}
    </ul>
  );
}

function PriceRow({ price }: { price: PriceRowDTO }) {
  const { isPending, run } = useRun();
  return (
    <li className="flex items-center justify-between gap-3 py-1.5 text-sm">
      <span className="text-muted-foreground">{formatExpenseDate(price.date)}</span>
      <span className="ml-auto font-medium tabular-nums">{formatCurrency(price.price)}</span>
      <Button
        variant="ghost"
        size="icon-sm"
        aria-label={`Remove price of ${formatExpenseDate(price.date)}`}
        className="text-muted-foreground hover:text-destructive"
        disabled={isPending}
        onClick={() => run(() => deletePrice(price.id))}
      >
        {isPending ? <Loader2 className="animate-spin" /> : <Trash2 />}
      </Button>
    </li>
  );
}

export function PriceList({ prices }: { prices: PriceRowDTO[] }) {
  return (
    <ul aria-label="Prices you entered">
      {prices.map((p) => (
        <PriceRow key={p.id} price={p} />
      ))}
    </ul>
  );
}

/** Price over time, one series; the dashed line is what you paid on average. */
export function PriceChart({ data, avgCost }: { data: PricePoint[]; avgCost: number }) {
  const values = [...data.map((d) => d.price), ...(avgCost > 0 ? [avgCost] : [])];
  const min = Math.min(...values);
  const max = Math.max(...values);
  const pad = (max - min || max * 0.1) * 0.15;
  return (
    <div className="h-64">
      <ResponsiveContainer width="100%" height="100%">
        <LineChart data={data} margin={{ top: 16, right: 16, left: 8, bottom: 0 }}>
          <CartesianGrid vertical={false} stroke="var(--border)" />
          <XAxis
            dataKey="label"
            tickLine={false}
            axisLine={false}
            tickMargin={8}
            minTickGap={32}
            tick={{ fill: "var(--muted-foreground)", fontSize: 12 }}
          />
          <YAxis
            domain={[Math.max(0, min - pad), max + pad]}
            tickLine={false}
            axisLine={false}
            width={64}
            tick={{ fill: "var(--muted-foreground)", fontSize: 12 }}
            tickFormatter={(v: number) => formatCurrencyCompact(v)}
          />
          <Tooltip
            cursor={{ stroke: "var(--muted-foreground)", strokeDasharray: "3 3" }}
            content={({ active, payload }) => {
              if (!active || !payload?.length) return null;
              const p = payload[0].payload as PricePoint;
              const rows = [{ name: "Price", value: p.price, color: "var(--chart-1)" }];
              if (avgCost > 0) rows.push({ name: "Your avg cost", value: Math.round(avgCost * 100) / 100, color: "var(--muted-foreground)" });
              return <ChartTooltipCard title={formatExpenseDate(p.date)} rows={rows} />;
            }}
          />
          {avgCost > 0 && (
            <ReferenceLine
              y={avgCost}
              stroke="var(--muted-foreground)"
              strokeDasharray="4 4"
              label={{ value: "Avg cost", position: "insideTopRight", fill: "var(--muted-foreground)", fontSize: 11 }}
            />
          )}
          <Line
            type="monotone"
            dataKey="price"
            stroke="var(--chart-1)"
            strokeWidth={2}
            dot={{ r: 4, strokeWidth: 2, stroke: "var(--card)", fill: "var(--chart-1)" }}
            activeDot={{ r: 5 }}
            isAnimationActive={false}
          />
        </LineChart>
      </ResponsiveContainer>
    </div>
  );
}

/** Net worth at the end of each month, one series. A dashed line marks zero when it goes negative. */
export function NetWorthChart({ data }: { data: { month: string; label: string; total: number }[] }) {
  const values = data.map((d) => d.total);
  const min = Math.min(...values);
  const max = Math.max(...values);
  // Keep at least ±5% of the value around the line, so a small change doesn't look like a cliff.
  const pad = Math.max((max - min) * 0.15, Math.abs(max) * 0.05, 1000);
  const crossesZero = min < 0;
  return (
    <div className="h-56" data-testid="net-worth-chart">
      <ResponsiveContainer width="100%" height="100%">
        <LineChart data={data} margin={{ top: 16, right: 16, left: 8, bottom: 0 }}>
          <CartesianGrid vertical={false} stroke="var(--border)" />
          <XAxis
            dataKey="label"
            tickLine={false}
            axisLine={false}
            tickMargin={8}
            minTickGap={24}
            tick={{ fill: "var(--muted-foreground)", fontSize: 12 }}
          />
          <YAxis
            domain={[crossesZero ? min - pad : Math.max(0, min - pad), max + pad]}
            tickLine={false}
            axisLine={false}
            width={84}
            tick={{ fill: "var(--muted-foreground)", fontSize: 12 }}
            tickFormatter={(v: number) => formatCurrencyCompact(v)}
          />
          <Tooltip
            cursor={{ stroke: "var(--muted-foreground)", strokeDasharray: "3 3" }}
            content={({ active, payload }) => {
              if (!active || !payload?.length) return null;
              const p = payload[0].payload as { label: string; total: number };
              return <ChartTooltipCard title={p.label} rows={[{ name: "Net worth", value: p.total, color: "var(--chart-1)" }]} />;
            }}
          />
          {crossesZero && <ReferenceLine y={0} stroke="var(--muted-foreground)" strokeDasharray="4 4" />}
          <Line
            type="monotone"
            dataKey="total"
            stroke="var(--chart-1)"
            strokeWidth={2}
            dot={{ r: 4, strokeWidth: 2, stroke: "var(--card)", fill: "var(--chart-1)" }}
            activeDot={{ r: 5 }}
            isAnimationActive={false}
          />
        </LineChart>
      </ResponsiveContainer>
    </div>
  );
}
