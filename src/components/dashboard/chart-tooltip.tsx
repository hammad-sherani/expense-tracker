"use client";

import { formatCurrency } from "@/lib/format";

type Row = { name: string; value: number; color?: string; dashed?: boolean };

/** Shared tooltip card for all dashboard charts. */
export function ChartTooltipCard({ title, rows }: { title: string; rows: Row[] }) {
  return (
    <div className="min-w-40 rounded-lg border bg-popover px-3 py-2 text-xs text-popover-foreground shadow-md">
      <p className="font-medium">{title}</p>
      <div className="mt-1.5 flex flex-col gap-1">
        {rows.map((r) => (
          <div key={r.name} className="flex items-center justify-between gap-4">
            <span className="flex items-center gap-1.5 text-muted-foreground">
              {r.color && (
                <span
                  className="h-0.5 w-3 rounded-full"
                  style={{
                    backgroundColor: r.dashed ? "transparent" : r.color,
                    borderTop: r.dashed ? `2px dashed ${r.color}` : undefined,
                  }}
                />
              )}
              {r.name}
            </span>
            <span className="font-medium tabular-nums">{formatCurrency(r.value)}</span>
          </div>
        ))}
      </div>
    </div>
  );
}
