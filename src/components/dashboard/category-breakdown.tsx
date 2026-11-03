import { PieChart as PieIcon } from "lucide-react";
import Link from "next/link";
import { CategoryIcon } from "@/components/expenses/category-badge";
import { EmptyState } from "@/components/shared/empty-state";
import { Card, CardAction, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { CATEGORY_META } from "@/lib/constants";
import { formatCurrency, formatPercent } from "@/lib/format";
import type { DashboardData } from "@/types";

/**
 * Category breakdown as ranked horizontal bars (magnitude), one hue.
 * Identity comes from the icon + label, never from color alone.
 */
export function CategoryBreakdown({
  data,
  periodLabel,
  periodParam,
}: {
  data: DashboardData["categories"];
  periodLabel: string;
  periodParam: string;
}) {
  const max = data.slices[0]?.total ?? 0;

  return (
    <Card className="gap-4">
      <CardHeader>
        <CardTitle>Spending by category</CardTitle>
        <CardDescription>
          {periodLabel} · {formatCurrency(data.total)}
        </CardDescription>
        {data.slices.length > 0 && (
          <CardAction>
            <span className="text-xs text-muted-foreground">{data.slices.length} categories</span>
          </CardAction>
        )}
      </CardHeader>
      <CardContent>
        {data.slices.length === 0 ? (
          <EmptyState icon={PieIcon} title="No category data" description="Add expenses to see where your money goes." className="py-8" />
        ) : (
          <ul className="flex flex-col gap-1">
            {data.slices.map((s) => (
              <li key={s.category}>
                <Link
                  href={`/expenses?period=${periodParam}&category=${s.category}`}
                  className="group -mx-2 flex items-center gap-3 rounded-lg px-2 py-2 transition-colors hover:bg-muted/60"
                  title={`View ${CATEGORY_META[s.category].label} expenses`}
                >
                  <CategoryIcon category={s.category} size="sm" />
                  <div className="min-w-0 flex-1">
                    <div className="flex items-baseline justify-between gap-2 text-sm">
                      <span className="truncate font-medium">{CATEGORY_META[s.category].label}</span>
                      <span className="shrink-0 font-medium tabular-nums">{formatCurrency(s.total)}</span>
                    </div>
                    <div className="mt-1.5 flex items-center gap-2">
                      <div className="h-1.5 flex-1 overflow-hidden rounded-full bg-muted">
                        <div
                          className="h-full rounded-full bg-primary transition-[width] duration-500"
                          style={{ width: `${max > 0 ? Math.max(2, (s.total / max) * 100) : 0}%` }}
                        />
                      </div>
                      <span className="w-12 shrink-0 text-right text-xs text-muted-foreground tabular-nums">
                        {formatPercent(s.percent)}
                      </span>
                    </div>
                  </div>
                </Link>
              </li>
            ))}
          </ul>
        )}
      </CardContent>
    </Card>
  );
}
