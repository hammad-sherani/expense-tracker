"use client";

import { Banknote, Loader2, MoreVertical, Pencil, Plus, Search, Trash2, X } from "lucide-react";
import { usePathname, useSearchParams } from "next/navigation";
import { useEffect, useRef, useState, useTransition } from "react";
import { toast } from "sonner";
import { IncomeDialog } from "@/components/income/income-dialog";
import { useNavigationTransition } from "@/components/shared/navigation-transition";
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
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import { Input } from "@/components/ui/input";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { formatExpenseDate } from "@/lib/dates";
import { formatCurrency } from "@/lib/format";
import { INCOME_TYPE_LABELS, INCOME_TYPES, type IncomeTypeValue } from "@/lib/wallets";
import { deleteIncome } from "@/server/actions/income";
import type { IncomeDTO } from "@/types";

export function AddIncomeButton() {
  const [open, setOpen] = useState(false);
  return (
    <>
      <Button onClick={() => setOpen(true)}>
        <Plus />
        Add income
      </Button>
      <IncomeDialog open={open} onOpenChange={setOpen} />
    </>
  );
}

const ALL = "__all__";

export function IncomeFilters({ q, type }: { q: string; type?: IncomeTypeValue }) {
  const pathname = usePathname();
  const searchParams = useSearchParams();
  const { navigate } = useNavigationTransition();
  const [search, setSearch] = useState(q);
  const lastPushed = useRef(q);

  const update = (changes: Record<string, string | undefined>, replace = false) => {
    const params = new URLSearchParams(searchParams.toString());
    for (const [k, v] of Object.entries(changes)) {
      if (v) params.set(k, v);
      else params.delete(k);
    }
    params.delete("page");
    const qs = params.toString();
    navigate(qs ? `${pathname}?${qs}` : pathname, { replace });
  };

  useEffect(() => {
    const value = search.trim();
    if (value === lastPushed.current) return;
    const id = setTimeout(() => {
      lastPushed.current = value;
      update({ q: value || undefined }, true);
    }, 350);
    return () => clearTimeout(id);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [search]);

  return (
    <div className="flex flex-col gap-2 sm:flex-row">
      <div className="relative flex-1">
        <Search className="pointer-events-none absolute top-1/2 left-3 size-4 -translate-y-1/2 text-muted-foreground" />
        <Input
          value={search}
          onChange={(e) => setSearch(e.target.value)}
          placeholder="Search by source…"
          aria-label="Search income by source"
          className="pl-9"
          maxLength={100}
        />
        {search && (
          <button
            type="button"
            aria-label="Clear search"
            onClick={() => setSearch("")}
            className="absolute top-1/2 right-2 flex size-6 -translate-y-1/2 items-center justify-center rounded-md text-muted-foreground hover:bg-muted"
          >
            <X className="size-3.5" />
          </button>
        )}
      </div>
      <Select value={type ?? ALL} onValueChange={(v) => update({ type: v === ALL ? undefined : v })}>
        <SelectTrigger className="w-full sm:w-44" aria-label="Filter by type">
          <SelectValue>{type ? INCOME_TYPE_LABELS[type] : "All types"}</SelectValue>
        </SelectTrigger>
        <SelectContent>
          <SelectItem value={ALL}>All types</SelectItem>
          {INCOME_TYPES.map((t) => (
            <SelectItem key={t} value={t}>
              {INCOME_TYPE_LABELS[t]}
            </SelectItem>
          ))}
        </SelectContent>
      </Select>
    </div>
  );
}

function IncomeRow({ income }: { income: IncomeDTO }) {
  const [editing, setEditing] = useState(false);
  const [confirming, setConfirming] = useState(false);
  const [isPending, startTransition] = useTransition();

  const remove = () =>
    startTransition(async () => {
      const r = await deleteIncome(income.id);
      if (r.ok) toast.success(r.message);
      else toast.error(r.error);
      setConfirming(false);
    });

  return (
    <li className="flex items-center gap-3 px-4 py-3 sm:px-5">
      <span className="flex size-9 shrink-0 items-center justify-center rounded-lg bg-success/10 text-success" aria-hidden>
        <Banknote className="size-4" />
      </span>
      <div className="min-w-0 flex-1">
        <p className="truncate text-sm font-medium">{income.source}</p>
        <p className="truncate text-xs text-muted-foreground">
          {INCOME_TYPE_LABELS[income.type]} · {formatExpenseDate(income.date)}
          {income.wallet && ` · ${income.wallet.name}`}
        </p>
      </div>
      <span className="shrink-0 text-sm font-semibold text-success tabular-nums">+{formatCurrency(income.amount)}</span>
      <DropdownMenu>
        <DropdownMenuTrigger asChild>
          <Button variant="ghost" size="icon-sm" aria-label={`Options for ${income.source}`}>
            <MoreVertical />
          </Button>
        </DropdownMenuTrigger>
        <DropdownMenuContent align="end">
          <DropdownMenuItem onSelect={() => setEditing(true)}>
            <Pencil />
            Edit
          </DropdownMenuItem>
          <DropdownMenuItem variant="destructive" onSelect={() => setConfirming(true)}>
            <Trash2 />
            Delete
          </DropdownMenuItem>
        </DropdownMenuContent>
      </DropdownMenu>
      <IncomeDialog open={editing} onOpenChange={setEditing} income={income} />
      <AlertDialog open={confirming} onOpenChange={(o) => !isPending && setConfirming(o)}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>Delete this income?</AlertDialogTitle>
            <AlertDialogDescription>
              {`"${income.source}" (${formatCurrency(income.amount)}) will be removed. This can't be undone.`}
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel disabled={isPending}>Cancel</AlertDialogCancel>
            <AlertDialogAction
              variant="destructive"
              disabled={isPending}
              onClick={(e) => {
                e.preventDefault();
                remove();
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

export function IncomeList({ items }: { items: IncomeDTO[] }) {
  return (
    <ul className="divide-y">
      {items.map((i) => (
        <IncomeRow key={i.id} income={i} />
      ))}
    </ul>
  );
}
