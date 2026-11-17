import Link from "next/link";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { formatExpenseDate } from "@/lib/dates";
import { formatCurrency } from "@/lib/format";
import { cn } from "@/lib/utils";
import type { MonthPlan, PlanItem } from "@/server/queries/month-plan";

const TAG: Record<PlanItem["status"], string> = {
  paid: "bg-success/10 text-success",
  due: "bg-muted text-muted-foreground",
  overdue: "bg-destructive/10 text-destructive",
};

function tagText(item: PlanItem) {
  if (item.status === "paid") return "Paid";
  const date = formatExpenseDate(item.date, { day: "numeric", month: "short" });
  return item.status === "overdue" ? `Overdue · ${date}` : `Due ${date}`;
}

function Row({ label, value, tag, tagClass }: { label: string; value: string; tag?: string; tagClass?: string }) {
  return (
    <li className="flex items-center gap-2 py-1.5 text-sm">
      <span className="min-w-0 truncate">{label}</span>
      {tag && <span className={cn("shrink-0 rounded-full px-2 py-0.5 text-[11px] font-medium", tagClass)}>{tag}</span>}
      <span className="ml-auto shrink-0 font-medium tabular-nums">{value}</span>
    </li>
  );
}

/** Income, minus fixed payments and other spending, equals what's left this month. */
export function MonthPlanCard({ plan }: { plan: MonthPlan }) {
  const short = plan.leftToSpend < 0;
  return (
    <Card className="gap-3">
      <CardHeader>
        <CardTitle>Left to spend</CardTitle>
        <CardDescription>{plan.label} · after your fixed payments</CardDescription>
      </CardHeader>
      <CardContent className="flex flex-col gap-2">
        <ul aria-label="Month plan">
          <Row label="Income" value={formatCurrency(plan.income)} />
          {plan.items.map((i) => (
            <Row
              key={i.key}
              label={i.name}
              value={i.amount < 0 ? `+${formatCurrency(-i.amount)}` : `−${formatCurrency(i.amount)}`}
              tag={i.kind === "goal" || i.kind === "investment" ? undefined : tagText(i)}
              tagClass={TAG[i.status]}
            />
          ))}
          <Row label="Other spending" value={`−${formatCurrency(plan.otherSpending)}`} />
        </ul>
        <div className="flex items-baseline justify-between gap-3 border-t pt-3">
          <span className="text-sm font-medium">{short ? "Short by" : "Left to spend"}</span>
          <span
            className={cn("text-2xl font-semibold tracking-tight tabular-nums", short && "text-destructive")}
            data-testid="left-to-spend"
          >
            {formatCurrency(Math.abs(plan.leftToSpend))}
          </span>
        </div>
        {plan.income > 0 && plan.items.some((i) => i.kind !== "bill" && i.amount > 0) && (
          <p className="text-xs text-muted-foreground">
            Committees, goal savings, loan repayments and investments are taken out here, so this is the money left free to
            spend.
          </p>
        )}
        {plan.income === 0 && (
          <p className="text-xs text-muted-foreground">
            <Link href="/income" className="font-medium text-primary hover:underline">
              Add your income
            </Link>{" "}
            to see what&apos;s left after these payments.
          </p>
        )}
      </CardContent>
    </Card>
  );
}
