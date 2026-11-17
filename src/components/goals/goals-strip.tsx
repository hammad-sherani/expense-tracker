import Link from "next/link";
import { Card } from "@/components/ui/card";
import { formatCurrency } from "@/lib/format";
import { planSummary } from "@/lib/goals";
import type { GoalDTO } from "@/server/queries/goals";

/** Dashboard row: where each savings goal stands. */
export function GoalsStrip({ goals }: { goals: GoalDTO[] }) {
  return (
    <div className="grid gap-4 lg:grid-cols-2">
      {goals.slice(0, 4).map((g) => (
        <Card key={g.id} className="relative gap-2 px-5 py-4 transition-colors hover:bg-muted/30">
          <div className="flex items-baseline justify-between gap-3">
            <Link href={`/goals/${g.id}`} className="truncate font-medium after:absolute after:inset-0">
              {g.name}
            </Link>
            <span className="shrink-0 text-sm tabular-nums">
              <span className="font-semibold">{formatCurrency(g.saved)}</span>
              <span className="text-muted-foreground"> / {formatCurrency(g.targetAmount)}</span>
            </span>
          </div>
          <div
            className="h-2 overflow-hidden rounded-full bg-muted"
            role="progressbar"
            aria-label={`${g.name} progress`}
            aria-valuemin={0}
            aria-valuemax={100}
            aria-valuenow={Math.min(100, Math.round(g.percent))}
          >
            <div className="h-full rounded-full bg-primary" style={{ width: `${Math.min(100, g.percent)}%` }} />
          </div>
          <p className="truncate text-xs text-muted-foreground">{planSummary(g)}</p>
        </Card>
      ))}
    </div>
  );
}
