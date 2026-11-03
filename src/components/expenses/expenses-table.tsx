"use client";

import { ArrowDown, ArrowUp, ArrowUpDown, Eye, MoreHorizontal, Pencil, Trash2 } from "lucide-react";
import { usePathname, useSearchParams } from "next/navigation";
import { CategoryBadge, CategoryIcon } from "@/components/expenses/category-badge";
import { useExpenseUI } from "@/components/expenses/expense-dialogs";
import { useNavigationTransition } from "@/components/shared/navigation-transition";
import { Button } from "@/components/ui/button";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { CATEGORY_META, DEFAULT_SORT, PAYMENT_METHOD_LABELS, type SortValue } from "@/lib/constants";
import { formatExpenseDate } from "@/lib/dates";
import { formatCurrency } from "@/lib/format";
import { cn } from "@/lib/utils";
import type { ExpenseDTO } from "@/types";

function RowActions({ expense }: { expense: ExpenseDTO }) {
  const { openDetails, openEdit, requestDelete } = useExpenseUI();
  return (
    <DropdownMenu>
      <DropdownMenuTrigger asChild>
        <Button
          variant="ghost"
          size="icon-sm"
          aria-label={`Actions for ${expense.description}`}
          onClick={(e) => e.stopPropagation()}
        >
          <MoreHorizontal />
        </Button>
      </DropdownMenuTrigger>
      <DropdownMenuContent align="end" onClick={(e) => e.stopPropagation()}>
        <DropdownMenuItem onSelect={() => openDetails(expense)}>
          <Eye />
          View details
        </DropdownMenuItem>
        <DropdownMenuItem onSelect={() => openEdit(expense)}>
          <Pencil />
          Edit
        </DropdownMenuItem>
        <DropdownMenuSeparator />
        <DropdownMenuItem variant="destructive" onSelect={() => requestDelete(expense)}>
          <Trash2 />
          Delete
        </DropdownMenuItem>
      </DropdownMenuContent>
    </DropdownMenu>
  );
}

function SortHeader({
  label,
  field,
  sort,
  className,
}: {
  label: string;
  field: "date" | "amount";
  sort: SortValue;
  className?: string;
}) {
  const pathname = usePathname();
  const searchParams = useSearchParams();
  const { navigate } = useNavigationTransition();
  const active = sort.startsWith(field);
  const dir = active ? (sort.endsWith("desc") ? "desc" : "asc") : null;
  const next: SortValue = `${field}-${dir === "desc" ? "asc" : "desc"}`;
  const Icon = dir === "desc" ? ArrowDown : dir === "asc" ? ArrowUp : ArrowUpDown;

  return (
    <button
      type="button"
      onClick={() => {
        const params = new URLSearchParams(searchParams.toString());
        if (next === DEFAULT_SORT) params.delete("sort");
        else params.set("sort", next);
        params.delete("page");
        navigate(`${pathname}?${params.toString()}`);
      }}
      className={cn(
        "-mx-1 inline-flex items-center gap-1 rounded px-1 hover:text-foreground",
        active && "text-foreground",
        className,
      )}
      aria-label={`Sort by ${label}`}
    >
      {label}
      <Icon className={cn("size-3.5", !active && "opacity-50")} />
    </button>
  );
}

export function ExpensesTable({ expenses, sort }: { expenses: ExpenseDTO[]; sort: SortValue }) {
  const { openDetails } = useExpenseUI();

  return (
    <>
      {/* Desktop / tablet */}
      <div className="hidden md:block">
        <Table>
          <TableHeader>
            <TableRow className="hover:bg-transparent">
              <TableHead className="pl-5">Description</TableHead>
              <TableHead>Category</TableHead>
              <TableHead>
                <SortHeader label="Date" field="date" sort={sort} />
              </TableHead>
              <TableHead className="hidden lg:table-cell">Payment</TableHead>
              <TableHead className="text-right">
                <SortHeader label="Amount" field="amount" sort={sort} className="flex-row-reverse" />
              </TableHead>
              <TableHead className="w-12 pr-3" />
            </TableRow>
          </TableHeader>
          <TableBody>
            {expenses.map((e) => (
              <TableRow
                key={e.id}
                tabIndex={0}
                onClick={() => openDetails(e)}
                onKeyDown={(ev) => {
                  if (ev.key === "Enter" || ev.key === " ") {
                    ev.preventDefault();
                    openDetails(e);
                  }
                }}
                className="cursor-pointer focus-visible:bg-muted/60 focus-visible:outline-none"
              >
                <TableCell className="max-w-0 pl-5 sm:w-[40%]">
                  <div className="flex items-center gap-3">
                    <CategoryIcon category={e.category} size="sm" />
                    <div className="min-w-0">
                      <p className="truncate font-medium">{e.description}</p>
                      {e.notes && <p className="truncate text-xs text-muted-foreground">{e.notes}</p>}
                    </div>
                  </div>
                </TableCell>
                <TableCell>
                  <CategoryBadge category={e.category} />
                </TableCell>
                <TableCell className="whitespace-nowrap text-muted-foreground">{formatExpenseDate(e.date)}</TableCell>
                <TableCell className="hidden whitespace-nowrap text-muted-foreground lg:table-cell">
                  {e.paymentMethod ? PAYMENT_METHOD_LABELS[e.paymentMethod].split(" (")[0] : "—"}
                </TableCell>
                <TableCell className="text-right font-semibold whitespace-nowrap tabular-nums">
                  {formatCurrency(e.amount)}
                </TableCell>
                <TableCell className="pr-3 text-right">
                  <RowActions expense={e} />
                </TableCell>
              </TableRow>
            ))}
          </TableBody>
        </Table>
      </div>

      {/* Mobile */}
      <ul className="divide-y md:hidden">
        {expenses.map((e) => (
          <li key={e.id} className="flex items-center gap-1 pr-2">
            <button
              type="button"
              onClick={() => openDetails(e)}
              className="flex min-w-0 flex-1 items-center gap-3 px-4 py-3 text-left"
            >
              <CategoryIcon category={e.category} />
              <div className="min-w-0 flex-1">
                <p className="truncate text-sm font-medium">{e.description}</p>
                <p className="truncate text-xs text-muted-foreground">
                  {CATEGORY_META[e.category].label} · {formatExpenseDate(e.date)}
                </p>
              </div>
              <span className="shrink-0 text-sm font-semibold tabular-nums">{formatCurrency(e.amount)}</span>
            </button>
            <RowActions expense={e} />
          </li>
        ))}
      </ul>
    </>
  );
}
