"use client";

import { ArrowRight, Plus, ReceiptText } from "lucide-react";
import Link from "next/link";
import { CategoryIcon } from "@/components/expenses/category-badge";
import { useExpenseUI } from "@/components/expenses/expense-dialogs";
import { EmptyState } from "@/components/shared/empty-state";
import { Button } from "@/components/ui/button";
import { Card, CardAction, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { CATEGORY_META } from "@/lib/constants";
import { formatExpenseDate } from "@/lib/dates";
import { formatCurrency } from "@/lib/format";
import type { ExpenseDTO } from "@/types";

export function RecentExpenses({
  expenses,
  periodLabel,
  periodParam,
}: {
  expenses: ExpenseDTO[];
  periodLabel: string;
  periodParam: string;
}) {
  const { openDetails, openCreate } = useExpenseUI();

  return (
    <Card className="gap-4">
      <CardHeader>
        <CardTitle>Recent expenses</CardTitle>
        <CardDescription>{periodLabel}</CardDescription>
        <CardAction>
          <Button variant="ghost" size="sm" asChild>
            <Link href={`/expenses?period=${periodParam}`}>
              View all
              <ArrowRight />
            </Link>
          </Button>
        </CardAction>
      </CardHeader>
      <CardContent>
        {expenses.length === 0 ? (
          <EmptyState
            icon={ReceiptText}
            title="No expenses yet"
            description="Expenses you add for this period will show up here."
            className="py-8"
            action={
              <Button size="sm" onClick={openCreate}>
                <Plus />
                Add expense
              </Button>
            }
          />
        ) : (
          <ul className="-mx-2 flex flex-col">
            {expenses.map((e) => (
              <li key={e.id}>
                <button
                  type="button"
                  onClick={() => openDetails(e)}
                  className="flex w-full items-center gap-3 rounded-lg px-2 py-2.5 text-left transition-colors hover:bg-muted/60 focus-visible:ring-3 focus-visible:ring-ring/50 focus-visible:outline-none"
                >
                  <CategoryIcon category={e.category} />
                  <div className="min-w-0 flex-1">
                    <p className="truncate text-sm font-medium">{e.description}</p>
                    <p className="truncate text-xs text-muted-foreground">
                      {CATEGORY_META[e.category].label} · {formatExpenseDate(e.date, { day: "numeric", month: "short" })}
                    </p>
                  </div>
                  <span className="shrink-0 text-sm font-semibold tabular-nums">{formatCurrency(e.amount)}</span>
                </button>
              </li>
            ))}
          </ul>
        )}
      </CardContent>
    </Card>
  );
}
