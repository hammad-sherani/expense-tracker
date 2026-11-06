"use client";

import { ArrowRight, CalendarDays, Clock, CreditCard, Loader2, Pencil, StickyNote, Trash2, Users } from "lucide-react";
import Link from "next/link";
import { createContext, useCallback, useContext, useMemo, useState, useTransition } from "react";
import { toast } from "sonner";
import { CategoryBadge, CategoryIcon } from "@/components/expenses/category-badge";
import { ExpenseForm } from "@/components/expenses/expense-form";
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
import { Button } from "@/components/ui/button";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { Separator } from "@/components/ui/separator";
import {
  Sheet,
  SheetContent,
  SheetDescription,
  SheetFooter,
  SheetHeader,
  SheetTitle,
} from "@/components/ui/sheet";
import { PAYMENT_METHOD_LABELS } from "@/lib/constants";
import { formatExpenseDate, formatTimestamp } from "@/lib/dates";
import { formatCurrency, roundMoney } from "@/lib/format";
import { initials } from "@/lib/initials";
import { cn } from "@/lib/utils";
import { deleteExpense } from "@/server/actions/expenses";
import type { ExpenseDTO } from "@/types";

type ExpenseUI = {
  openCreate: () => void;
  openEdit: (expense: ExpenseDTO) => void;
  openDetails: (expense: ExpenseDTO) => void;
  requestDelete: (expense: ExpenseDTO) => void;
};

const ExpenseUIContext = createContext<ExpenseUI | null>(null);

export function useExpenseUI() {
  const ctx = useContext(ExpenseUIContext);
  if (!ctx) throw new Error("useExpenseUI must be used within ExpenseUIProvider");
  return ctx;
}

type FormState = { open: false } | { open: true; expense?: ExpenseDTO };

/**
 * Hosts the add/edit dialog, the details sheet and the delete confirmation so
 * any page (dashboard, expenses table, header quick-add) can trigger them.
 */
export function ExpenseUIProvider({ children }: { children: React.ReactNode }) {
  const [form, setForm] = useState<FormState>({ open: false });
  const [details, setDetails] = useState<ExpenseDTO | null>(null);
  const [detailsOpen, setDetailsOpen] = useState(false);
  const [deleting, setDeleting] = useState<ExpenseDTO | null>(null);

  const api = useMemo<ExpenseUI>(
    () => ({
      openCreate: () => setForm({ open: true }),
      openEdit: (expense) => setForm({ open: true, expense }),
      openDetails: (expense) => {
        setDetails(expense);
        setDetailsOpen(true);
      },
      requestDelete: (expense) => setDeleting(expense),
    }),
    [],
  );

  const editing = form.open ? form.expense : undefined;

  const handleSaved = useCallback(
    (saved: ExpenseDTO) => {
      setForm({ open: false });
      // Keep the details panel in sync if it shows the edited expense.
      setDetails((current) => (current?.id === saved.id ? saved : current));
    },
    [],
  );

  const handleDeleted = useCallback(
    (id: string) => {
      setDeleting(null);
      if (details?.id === id) setDetailsOpen(false);
    },
    [details],
  );

  return (
    <ExpenseUIContext.Provider value={api}>
      {children}

      <Dialog open={form.open} onOpenChange={(open) => !open && setForm({ open: false })}>
        <DialogContent className="max-h-[92dvh] overflow-y-auto sm:max-w-xl">
          <DialogHeader>
            <DialogTitle>{editing ? "Edit expense" : "Add expense"}</DialogTitle>
            <DialogDescription>
              {editing ? "Update the details of this expense." : "Record a new expense. Fields marked * are required."}
            </DialogDescription>
          </DialogHeader>
          {form.open && (
            <ExpenseForm
              key={editing?.id ?? "new"}
              expense={editing}
              onSuccess={handleSaved}
              onCancel={() => setForm({ open: false })}
            />
          )}
        </DialogContent>
      </Dialog>

      <ExpenseDetailsSheet
        expense={details}
        open={detailsOpen}
        onOpenChange={setDetailsOpen}
        onEdit={(e) => setForm({ open: true, expense: e })}
        onDelete={(e) => setDeleting(e)}
      />

      <DeleteExpenseDialog expense={deleting} onClose={() => setDeleting(null)} onDeleted={handleDeleted} />
    </ExpenseUIContext.Provider>
  );
}

function DetailRow({
  icon: Icon,
  label,
  children,
}: {
  icon: React.ComponentType<{ className?: string }>;
  label: string;
  children: React.ReactNode;
}) {
  return (
    <div className="flex gap-3 py-3">
      <Icon className="mt-0.5 size-4 shrink-0 text-muted-foreground" />
      <div className="min-w-0 flex-1">
        <p className="text-xs font-medium text-muted-foreground">{label}</p>
        <div className="mt-0.5 text-sm text-foreground">{children}</div>
      </div>
    </div>
  );
}

function ExpenseDetailsSheet({
  expense,
  open,
  onOpenChange,
  onEdit,
  onDelete,
}: {
  expense: ExpenseDTO | null;
  open: boolean;
  onOpenChange: (open: boolean) => void;
  onEdit: (expense: ExpenseDTO) => void;
  onDelete: (expense: ExpenseDTO) => void;
}) {
  return (
    <Sheet open={open} onOpenChange={onOpenChange}>
      <SheetContent className="flex w-full flex-col gap-0 sm:max-w-md">
        {expense && (
          <>
            <SheetHeader className="gap-4 border-b pb-6">
              <div className="flex items-center gap-3">
                <CategoryIcon category={expense.category} size="lg" />
                <div className="min-w-0">
                  <SheetDescription>Expense details</SheetDescription>
                  <CategoryBadge category={expense.category} className="mt-1" />
                </div>
              </div>
              <div>
                <p className="text-3xl font-semibold tracking-tight tabular-nums">
                  {formatCurrency(expense.amount)}
                </p>
                {expense.split && (
                  <p className="mt-1 text-xs text-muted-foreground">
                    Your share of a {formatCurrency(expense.split.total)} bill
                  </p>
                )}
                <SheetTitle className="mt-2 text-base font-medium break-words whitespace-pre-wrap">
                  {expense.description}
                </SheetTitle>
              </div>
            </SheetHeader>

            <div className="flex-1 overflow-y-auto px-4">
              <div className="divide-y">
                <DetailRow icon={CalendarDays} label="Expense date">
                  {formatExpenseDate(expense.date, {
                    weekday: "long",
                    day: "numeric",
                    month: "long",
                    year: "numeric",
                  })}
                </DetailRow>
                <DetailRow icon={CreditCard} label="Payment method">
                  {expense.paymentMethod ? (
                    PAYMENT_METHOD_LABELS[expense.paymentMethod]
                  ) : (
                    <span className="text-muted-foreground">Not specified</span>
                  )}
                </DetailRow>
                <DetailRow icon={StickyNote} label="Notes">
                  {expense.notes ? (
                    <p className="break-words whitespace-pre-wrap">{expense.notes}</p>
                  ) : (
                    <span className="text-muted-foreground">No notes</span>
                  )}
                </DetailRow>
              </div>
              {expense.split && <SplitDetails split={expense.split} myShare={expense.amount} />}
              <Separator />
              <div className="grid grid-cols-2 gap-4 py-4 text-xs text-muted-foreground">
                <div className="flex gap-2">
                  <Clock className="mt-0.5 size-3.5 shrink-0" />
                  <div>
                    <p className="font-medium">Created</p>
                    <p className="mt-0.5 text-foreground/80">{formatTimestamp(expense.createdAt)}</p>
                  </div>
                </div>
                <div className="flex gap-2">
                  <Pencil className="mt-0.5 size-3.5 shrink-0" />
                  <div>
                    <p className="font-medium">Last updated</p>
                    <p className="mt-0.5 text-foreground/80">{formatTimestamp(expense.updatedAt)}</p>
                  </div>
                </div>
              </div>
            </div>

            <SheetFooter className="flex-row border-t">
              <Button variant="outline" className="flex-1" onClick={() => onEdit(expense)}>
                <Pencil />
                Edit
              </Button>
              <Button variant="destructive" className="flex-1" onClick={() => onDelete(expense)}>
                <Trash2 />
                Delete
              </Button>
            </SheetFooter>
          </>
        )}
      </SheetContent>
    </Sheet>
  );
}

function DeleteExpenseDialog({
  expense,
  onClose,
  onDeleted,
}: {
  expense: ExpenseDTO | null;
  onClose: () => void;
  onDeleted: (id: string) => void;
}) {
  const [isPending, startTransition] = useTransition();

  const confirm = () => {
    if (!expense) return;
    startTransition(async () => {
      const result = await deleteExpense(expense.id);
      if (!result.ok) {
        toast.error(result.error);
        return;
      }
      toast.success("Expense deleted", {
        description: `${expense.description} · ${formatCurrency(expense.amount)}`,
      });
      onDeleted(expense.id);
    });
  };

  return (
    <AlertDialog open={Boolean(expense)} onOpenChange={(open) => !open && !isPending && onClose()}>
      <AlertDialogContent>
        <AlertDialogHeader>
          <AlertDialogTitle>Delete this expense?</AlertDialogTitle>
          <AlertDialogDescription>
            {expense ? (
              <>
                <span className="font-medium text-foreground">{expense.description}</span> (
                {formatCurrency(expense.amount)} on {formatExpenseDate(expense.date)}) will be permanently
                removed. This can&apos;t be undone.
                {expense.split && (
                  <span className="mt-2 block">
                    Its dues with {expense.split.participants.map((p) => p.friend.name).join(", ")} will be removed too
                    {expense.split.participants.some((p) => p.paidAmount > 0) &&
                      ", including repayments you've already recorded"}
                    .
                  </span>
                )}
              </>
            ) : null}
          </AlertDialogDescription>
        </AlertDialogHeader>
        <AlertDialogFooter>
          <AlertDialogCancel disabled={isPending}>Cancel</AlertDialogCancel>
          <AlertDialogAction
            disabled={isPending}
            className="bg-destructive text-white hover:bg-destructive/90"
            onClick={(e) => {
              e.preventDefault();
              confirm();
            }}
          >
            {isPending && <Loader2 className="animate-spin" />}
            Delete
          </AlertDialogAction>
        </AlertDialogFooter>
      </AlertDialogContent>
    </AlertDialog>
  );
}

function SplitDetails({ split, myShare }: { split: NonNullable<ExpenseDTO["split"]>; myShare: number }) {
  const iPaid = split.paidBy === null;
  return (
    <section className="border-t py-4" aria-label="Split details">
      <div className="flex items-center gap-2 text-xs font-medium text-muted-foreground">
        <Users className="size-4" />
        Split · {formatCurrency(split.total)} paid by {iPaid ? "you" : split.paidBy?.name}
      </div>
      <ul className="mt-3 flex flex-col gap-2.5">
        <li className="flex items-center gap-3 text-sm">
          <span className="flex size-7 items-center justify-center rounded-full bg-primary/10 text-[10px] font-semibold text-primary">
            You
          </span>
          <span className="flex-1">Your share</span>
          <span className="font-medium tabular-nums">{formatCurrency(myShare)}</span>
        </li>
        {split.participants.length === 0 && (
          <li className="rounded-md bg-destructive/10 px-3 py-2 text-xs text-destructive">
            No friends are attached to this split, so nobody owes you anything for it. Edit the expense and add the
            friends who shared the bill.
          </li>
        )}
        {split.participants.map((p) => {
          const remaining = roundMoney(p.share - p.paidAmount);
          const settled = remaining <= 0;
          return (
            <li key={p.dueId} className="flex items-center gap-3 text-sm">
              <span className="flex size-7 items-center justify-center rounded-full bg-muted text-[10px] font-semibold">
                {initials(p.friend.name)}
              </span>
              <span className="min-w-0 flex-1">
                <span className="block truncate">
                  {p.direction === "OWED_TO_ME" ? `${p.friend.name} owes you` : `You owe ${p.friend.name}`}
                </span>
                <span className={cn("text-xs", settled ? "text-success" : "text-muted-foreground")}>
                  {settled
                    ? "Settled"
                    : p.paidAmount > 0
                      ? `${formatCurrency(p.paidAmount)} paid · ${formatCurrency(remaining)} left`
                      : "Not paid yet"}
                </span>
              </span>
              <span className="font-medium tabular-nums">{formatCurrency(p.share)}</span>
            </li>
          );
        })}
      </ul>
      <Button asChild variant="link" size="sm" className="mt-2 h-auto px-0">
        <Link href={`/dues?dir=${split.paidBy ? "owe" : "owed"}`}>
          Record payments on the Dues page
          <ArrowRight />
        </Link>
      </Button>
    </section>
  );
}
