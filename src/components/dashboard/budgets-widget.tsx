import Link from "next/link";
import { BudgetProgress } from "@/components/budgets/budget-ui";
import { Button } from "@/components/ui/button";
import { Card, CardAction, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import type { BudgetStatus } from "@/server/budgets";

/** The budgets closest to (or over) their limit this month. */
export function BudgetsWidget({ budgets, periodLabel }: { budgets: BudgetStatus[]; periodLabel: string }) {
  const top = [...budgets].sort((a, b) => b.percent - a.percent).slice(0, 4);
  return (
    <Card className="gap-4">
      <CardHeader>
        <CardTitle>Budgets</CardTitle>
        <CardDescription>{periodLabel}</CardDescription>
        <CardAction>
          <Button asChild variant="ghost" size="sm">
            <Link href="/budgets">{budgets.length ? "All budgets" : "Set a budget"}</Link>
          </Button>
        </CardAction>
      </CardHeader>
      <CardContent>
        {top.length === 0 ? (
          <p className="py-4 text-center text-sm text-muted-foreground">
            No budgets yet. Set a monthly limit to get warned before you overspend.
          </p>
        ) : (
          <ul className="flex flex-col gap-4">
            {top.map((b) => (
              <li key={b.id}>
                <BudgetProgress budget={b} compact />
              </li>
            ))}
          </ul>
        )}
      </CardContent>
    </Card>
  );
}
