"use client";

import { BadgeCheck, ChevronDown, HandCoins, Loader2, Trash2, Undo2 } from "lucide-react";
import { useState, useTransition } from "react";
import { toast } from "sonner";
import { PaymentDialog } from "@/components/dues/payment-dialog";
import {
  AlertDialog,
  AlertDialogAction,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
} from "@/components/ui/alert-dialog";
import { Avatar, AvatarFallback } from "@/components/ui/avatar";
import { Button } from "@/components/ui/button";
import { Card } from "@/components/ui/card";
import { Collapsible, CollapsibleContent, CollapsibleTrigger } from "@/components/ui/collapsible";
import { formatExpenseDate } from "@/lib/dates";
import { formatCurrency } from "@/lib/format";
import { initials } from "@/lib/initials";
import { cn } from "@/lib/utils";
import { deleteDue, deletePayment, settleFriend } from "@/server/actions/dues";
import type { DueDTO, FriendDuesDTO } from "@/types";

function DueRow({ due, friendName }: { due: DueDTO; friendName: string }) {
  const [paying, setPaying] = useState(false);
  const [isUndoing, startUndo] = useTransition();
  const [deleting, setDeleting] = useState(false);
  const [isDeleting, startDelete] = useTransition();
  const settled = due.remaining <= 0;
  const progress = due.amount > 0 ? Math.min(100, (due.paidAmount / due.amount) * 100) : 0;

  return (
    <li className="flex flex-col gap-2 py-3">
      <div className="flex items-start gap-3">
        <div className="min-w-0 flex-1">
          <p className="flex items-center gap-2 text-sm font-medium">
            <span className="truncate">{due.description}</span>
            {due.standalone && (
              <span className="shrink-0 rounded-full bg-muted px-1.5 py-0.5 text-[10px] font-medium text-muted-foreground">
                Not an expense
              </span>
            )}
          </p>
          <p className="text-xs text-muted-foreground">
            {formatExpenseDate(due.date)}
            {due.expense?.splitTotal ? ` · bill ${formatCurrency(due.expense.splitTotal)} · share ` : " · "}
            {formatCurrency(due.amount)}
          </p>
        </div>
        <div className="text-right">
          {settled ? (
            <span className="inline-flex items-center gap-1 text-xs font-medium text-success">
              <BadgeCheck className="size-3.5" /> Settled
            </span>
          ) : (
            <>
              <p className="text-sm font-semibold tabular-nums">{formatCurrency(due.remaining)}</p>
              <p className="text-xs text-muted-foreground">left</p>
            </>
          )}
        </div>
        {!settled && (
          <Button size="sm" variant="outline" onClick={() => setPaying(true)}>
            Record
          </Button>
        )}
        {due.standalone && (
          <Button
            size="icon-sm"
            variant="ghost"
            aria-label={`Delete "${due.description}"`}
            className="text-muted-foreground hover:text-destructive"
            onClick={() => setDeleting(true)}
          >
            <Trash2 />
          </Button>
        )}
      </div>

      {due.paidAmount > 0 && (
        <div className="h-1 overflow-hidden rounded-full bg-muted" aria-hidden>
          <div className={cn("h-full rounded-full", settled ? "bg-success" : "bg-primary")} style={{ width: `${progress}%` }} />
        </div>
      )}

      {due.payments.length > 0 && (
        <ul className="flex flex-col gap-1 pl-1" aria-label="Payments">
          {due.payments.map((p) => (
            <li key={p.id} className="flex items-center gap-2 text-xs text-muted-foreground">
              <span className="size-1 rounded-full bg-muted-foreground/60" />
              <span className="tabular-nums">
                {formatCurrency(p.amount)} on {formatExpenseDate(p.date, { day: "numeric", month: "short" })}
              </span>
              {p.note && <span className="truncate">· {p.note}</span>}
              <button
                type="button"
                className="ml-auto inline-flex items-center gap-1 rounded px-1 hover:text-foreground disabled:opacity-50"
                disabled={isUndoing}
                aria-label={`Remove payment of ${formatCurrency(p.amount)}`}
                onClick={() =>
                  startUndo(async () => {
                    const result = await deletePayment(p.id);
                    if (result.ok) toast.success(result.message);
                    else toast.error(result.error);
                  })
                }
              >
                {isUndoing ? <Loader2 className="size-3 animate-spin" /> : <Undo2 className="size-3" />}
                Undo
              </button>
            </li>
          ))}
        </ul>
      )}

      {paying && <PaymentDialog due={due} friendName={friendName} open={paying} onOpenChange={setPaying} />}

      <AlertDialog open={deleting} onOpenChange={(o) => !isDeleting && setDeleting(o)}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>Delete this due?</AlertDialogTitle>
            <AlertDialogDescription>
              &ldquo;{due.description}&rdquo; ({formatCurrency(due.amount)}) with {friendName} will be removed
              {due.payments.length > 0 ? ", along with its recorded payments" : ""}. This can&apos;t be undone.
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel disabled={isDeleting}>Cancel</AlertDialogCancel>
            <AlertDialogAction
              disabled={isDeleting}
              className="bg-destructive text-white hover:bg-destructive/90"
              onClick={(e) => {
                e.preventDefault();
                startDelete(async () => {
                  const result = await deleteDue(due.id);
                  if (result.ok) toast.success(result.message);
                  else toast.error(result.error);
                  setDeleting(false);
                });
              }}
            >
              {isDeleting && <Loader2 className="animate-spin" />}
              Delete
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </li>
  );
}

export function FriendDuesCard({ group, direction }: { group: FriendDuesDTO; direction: "OWED_TO_ME" | "I_OWE" }) {
  // Collapsed by default: one line per friend. Expand to see their bills.
  const [open, setOpen] = useState(false);
  const [confirming, setConfirming] = useState(false);
  const [isSettling, startSettle] = useTransition();
  const owedToMe = direction === "OWED_TO_ME";
  const name = group.friend.name;

  const settle = () =>
    startSettle(async () => {
      const result = await settleFriend(group.friend.id, direction);
      if (result.ok) toast.success(result.message);
      else toast.error(result.error);
      setConfirming(false);
    });

  return (
    <Card className="gap-0 py-0">
      <Collapsible open={open} onOpenChange={setOpen}>
        <div className="flex items-center gap-3 px-4 py-2.5 sm:px-5">
          <Avatar className="size-8">
            <AvatarFallback className="bg-primary/10 text-xs font-semibold text-primary">{initials(name)}</AvatarFallback>
          </Avatar>
          <p className="min-w-0 flex-1 truncate text-sm">
            <span className="font-medium">{name}</span>
            <span className="text-muted-foreground">
              {" · "}
              {group.dues.length === 1
                ? group.dues[0].description
                : `${group.dues.length} bills`}
            </span>
          </p>
          {group.remaining > 0 ? (
            <p className="shrink-0 text-sm whitespace-nowrap">
              <span className="hidden text-muted-foreground sm:inline">{owedToMe ? "owes you " : "you owe "}</span>
              <span className={cn("font-semibold tabular-nums", owedToMe ? "text-success" : "text-destructive")}>
                {formatCurrency(group.remaining)}
              </span>
            </p>
          ) : (
            <span className="inline-flex shrink-0 items-center gap-1 text-xs font-medium text-success">
              <BadgeCheck className="size-3.5" /> Settled
            </span>
          )}
          {group.remaining > 0 && (
            <Button size="sm" onClick={() => setConfirming(true)} aria-label={`Settle all with ${name}`}>
              <HandCoins />
              <span className="hidden sm:inline">Settle all</span>
            </Button>
          )}
          <CollapsibleTrigger asChild>
            <Button variant="ghost" size="icon-sm" aria-label={open ? `Hide ${name}'s bills` : `Show ${name}'s bills`}>
              <ChevronDown className={cn("transition-transform", open && "rotate-180")} />
            </Button>
          </CollapsibleTrigger>
        </div>
        <CollapsibleContent>
          <div className="border-t px-4 sm:px-5">
            <ul className="divide-y">
              {group.dues.map((d) => (
                <DueRow key={d.id} due={d} friendName={name} />
              ))}
            </ul>
          </div>
        </CollapsibleContent>
      </Collapsible>

      <AlertDialog open={confirming} onOpenChange={(o) => !isSettling && setConfirming(o)}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>Settle up with {name}?</AlertDialogTitle>
            <AlertDialogDescription>
              {owedToMe
                ? `This records that ${name} paid you ${formatCurrency(group.remaining)} today, clearing every pending bill.`
                : `This records that you paid ${name} ${formatCurrency(group.remaining)} today, clearing every pending bill.`}
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel disabled={isSettling}>Cancel</AlertDialogCancel>
            <AlertDialogAction
              disabled={isSettling}
              onClick={(e) => {
                e.preventDefault();
                settle();
              }}
            >
              {isSettling && <Loader2 className="animate-spin" />}
              Settle up
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </Card>
  );
}
