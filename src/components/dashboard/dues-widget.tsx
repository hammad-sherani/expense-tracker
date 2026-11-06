import { ArrowRight, HandCoins } from "lucide-react";
import Link from "next/link";
import { EmptyState } from "@/components/shared/empty-state";
import { Avatar, AvatarFallback } from "@/components/ui/avatar";
import { Button } from "@/components/ui/button";
import { Card, CardAction, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { formatCurrency } from "@/lib/format";
import { initials } from "@/lib/initials";
import type { DuesSummary, FriendDuesDTO } from "@/types";

/** Who owes you (and whom you owe), at a glance. Independent of the selected month. */
export function DuesWidget({ summary, topOwing }: { summary: DuesSummary; topOwing: FriendDuesDTO[] }) {
  return (
    <Card className="gap-4">
      <CardHeader>
        <CardTitle>Dues</CardTitle>
        <CardDescription>From bills split with friends</CardDescription>
        <CardAction>
          <Button variant="ghost" size="sm" asChild>
            <Link href="/dues">
              Open
              <ArrowRight />
            </Link>
          </Button>
        </CardAction>
      </CardHeader>
      <CardContent className="flex flex-col gap-4">
        <div className="grid grid-cols-2 gap-3">
          <div className="rounded-lg bg-success/10 p-3">
            <p className="text-xs text-muted-foreground">Owed to you</p>
            <p className="mt-1 text-lg font-semibold text-success tabular-nums">{formatCurrency(summary.owedToMe)}</p>
          </div>
          <div className="rounded-lg bg-destructive/10 p-3">
            <p className="text-xs text-muted-foreground">You owe</p>
            <p className="mt-1 text-lg font-semibold text-destructive tabular-nums">{formatCurrency(summary.iOwe)}</p>
          </div>
        </div>
        {summary.overdue > 0 && (
          <Link
            href="/dues?status=overdue"
            className="flex items-center gap-2 rounded-md bg-destructive/10 px-3 py-2 text-sm font-medium text-destructive hover:bg-destructive/15"
          >
            <span className="size-2 rounded-full bg-destructive" />
            {summary.overdue} due{summary.overdue === 1 ? " is" : "s are"} overdue
          </Link>
        )}
        {topOwing.length === 0 ? (
          <EmptyState
            icon={HandCoins}
            title="No pending dues"
            description="Split a bill to keep track of who owes you."
            className="py-4"
          />
        ) : (
          <ul className="flex flex-col gap-1">
            {topOwing.map((g) => (
              <li key={g.friend.id} className="flex items-center gap-3 py-1.5">
                <Avatar className="size-8">
                  <AvatarFallback className="bg-primary/10 text-xs font-semibold text-primary">
                    {initials(g.friend.name)}
                  </AvatarFallback>
                </Avatar>
                <span className="flex-1 truncate text-sm font-medium">{g.friend.name}</span>
                <span className="text-sm font-semibold tabular-nums">{formatCurrency(g.remaining)}</span>
              </li>
            ))}
          </ul>
        )}
      </CardContent>
    </Card>
  );
}
