"use client";

import { HandCoins, Search, SearchX, X } from "lucide-react";
import { useDeferredValue, useState } from "react";
import { ExpectedRow } from "@/components/goals/goal-ui";
import { EmptyState } from "@/components/shared/empty-state";
import { Card } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { formatExpenseDate } from "@/lib/dates";
import type { ExpectedDTO, GoalOption } from "@/server/queries/goals";

/** Text a payment can be found by: name, goal, notes, amounts and dates. */
function haystack(p: ExpectedDTO) {
  const amounts = [p.amount, p.receivedAmount, p.goalAmount].filter((n): n is number => n != null);
  const dates = [p.expectedDate, p.receivedAt].filter((d): d is string => Boolean(d));
  return [
    p.source,
    p.goal?.name,
    p.notes,
    ...amounts.flatMap((n) => [String(n), n.toLocaleString("en-US")]),
    ...dates.flatMap((d) => [d, formatExpenseDate(d)]),
  ]
    .filter(Boolean)
    .join(" ")
    .toLowerCase();
}

function List({ label, items, goals }: { label: string; items: ExpectedDTO[]; goals: GoalOption[] }) {
  return (
    <ul className="divide-y" aria-label={label}>
      {items.map((p) => (
        <ExpectedRow key={p.id} payment={p} goals={goals} />
      ))}
    </ul>
  );
}

/** Project payments with a search box. Search looks through every payment, received ones included. */
export function PaymentsSection({
  pending,
  recent,
  allReceived,
  goals,
}: {
  pending: ExpectedDTO[];
  /** Latest received payments, shown when not searching. */
  recent: ExpectedDTO[];
  allReceived: ExpectedDTO[];
  goals: GoalOption[];
}) {
  const [query, setQuery] = useState("");
  const q = useDeferredValue(query.trim().toLowerCase());
  const total = pending.length + allReceived.length;

  const words = q.split(/\s+/).filter(Boolean);
  const matches = (p: ExpectedDTO) => {
    const text = haystack(p);
    return words.every((w) => text.includes(w.replace(/,/g, "")) || text.includes(w));
  };
  const foundPending = q ? pending.filter(matches) : pending;
  const foundReceived = q ? allReceived.filter(matches) : recent;

  return (
    <>
      <section>
        <div className="mb-3 flex flex-col gap-2 sm:flex-row sm:items-center sm:justify-between">
          <h2 className="text-sm font-medium text-muted-foreground">Project payments</h2>
          {total > 0 && (
            <div className="relative sm:w-72">
              <Search className="pointer-events-none absolute top-1/2 left-3 size-4 -translate-y-1/2 text-muted-foreground" />
              <Input
                type="search"
                value={query}
                onChange={(e) => setQuery(e.target.value)}
                placeholder="Search payments…"
                aria-label="Search project payments"
                className="pr-9 pl-9 [&::-webkit-search-cancel-button]:hidden"
                maxLength={100}
              />
              {query && (
                <button
                  type="button"
                  aria-label="Clear search"
                  onClick={() => setQuery("")}
                  className="absolute top-1/2 right-2 flex size-6 -translate-y-1/2 items-center justify-center rounded-md text-muted-foreground hover:bg-muted hover:text-foreground"
                >
                  <X className="size-3.5" />
                </button>
              )}
            </div>
          )}
        </div>
        {q && (
          <p className="mb-2 text-xs text-muted-foreground" aria-live="polite">
            {foundPending.length + foundReceived.length} found for “{query.trim()}”
          </p>
        )}
        <Card className="gap-0 py-0">
          {foundPending.length > 0 ? (
            <List label="Expected payments" items={foundPending} goals={goals} />
          ) : q ? (
            <EmptyState icon={SearchX} title="No expected payments match" description="Try another name, goal or amount." className="py-8" />
          ) : (
            <EmptyState
              icon={HandCoins}
              title="No expected payments"
              description="Add the project payments you're waiting for, so they count in your plan."
              className="py-8"
            />
          )}
        </Card>
      </section>

      {foundReceived.length > 0 && (
        <section>
          <h2 className="mb-3 text-sm font-medium text-muted-foreground">
            {q ? "Received (matching)" : "Recently received"}
          </h2>
          <Card className="gap-0 py-0">
            <List label="Received payments" items={foundReceived} goals={goals} />
          </Card>
        </section>
      )}
    </>
  );
}
