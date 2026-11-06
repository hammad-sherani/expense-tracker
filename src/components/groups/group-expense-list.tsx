"use client";

import { CategoryIcon } from "@/components/expenses/category-badge";
import { useExpenseUI } from "@/components/expenses/expense-dialogs";
import { formatExpenseDate } from "@/lib/dates";
import { formatCurrency } from "@/lib/format";
import type { ExpenseDTO } from "@/types";

/** A group's bills; click one to see details, edit or delete it. */
export function GroupExpenseList({ expenses }: { expenses: ExpenseDTO[] }) {
  const { openDetails } = useExpenseUI();
  return (
    <ul className="divide-y">
      {expenses.map((e) => {
        const total = e.split?.total ?? e.amount;
        const payer = e.split?.paidBy?.name ?? "You";
        return (
          <li key={e.id}>
            <button
              type="button"
              onClick={() => openDetails(e)}
              className="flex w-full items-center gap-3 px-4 py-3 text-left transition-colors hover:bg-muted/40 focus-visible:bg-muted/40 focus-visible:outline-none sm:px-5"
            >
              <CategoryIcon category={e.category} size="sm" />
              <div className="min-w-0 flex-1">
                <p className="truncate text-sm font-medium">{e.description}</p>
                <p className="truncate text-xs text-muted-foreground">
                  {formatExpenseDate(e.date, { day: "numeric", month: "short" })} · {payer} paid
                </p>
              </div>
              <div className="shrink-0 text-right">
                <p className="text-sm font-semibold tabular-nums">{formatCurrency(total)}</p>
                <p className="text-xs text-muted-foreground tabular-nums">your share {formatCurrency(e.amount)}</p>
              </div>
            </button>
          </li>
        );
      })}
    </ul>
  );
}
