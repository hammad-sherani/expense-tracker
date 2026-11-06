"use client";

import { zodResolver } from "@hookform/resolvers/zod";
import { CalendarIcon, Loader2, Settings2 } from "lucide-react";
import Link from "next/link";
import { useEffect, useState, useTransition } from "react";
import { Controller, useForm, useWatch } from "react-hook-form";
import { toast } from "sonner";
import { AddDueDialog } from "@/components/dues/add-due-dialog";
import { SplitEditor } from "@/components/expenses/split-editor";
import { useLookups } from "@/components/layout/lookups";
import { Button } from "@/components/ui/button";
import { Calendar } from "@/components/ui/calendar";
import { Field, FieldError, FieldGroup, FieldLabel } from "@/components/ui/field";
import { Input } from "@/components/ui/input";
import { Popover, PopoverContent, PopoverTrigger } from "@/components/ui/popover";
import { Skeleton } from "@/components/ui/skeleton";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { Textarea } from "@/components/ui/textarea";
import { categoryIcon } from "@/lib/category-icons";
import {
  dateInputToLocal,
  formatExpenseDate,
  localToDateInput,
  todayInput,
} from "@/lib/dates";
import { cn } from "@/lib/utils";
import { EMPTY_SPLIT, type ExpenseFormValues, expenseFormSchema } from "@/lib/validations/expense";
import { createExpense, updateExpense } from "@/server/actions/expenses";
import type { ExpenseDTO, FriendDTO } from "@/types";

const NO_WALLET = "__none__";

/** Keep only digits and a single dot, max 2 decimals. */
function sanitizeAmount(raw: string): string {
  let v = raw.replace(/,/g, "").replace(/[^\d.]/g, "");
  const firstDot = v.indexOf(".");
  if (firstDot !== -1) {
    v = v.slice(0, firstDot + 1) + v.slice(firstDot + 1).replace(/\./g, "");
    const [int, dec] = v.split(".");
    v = `${int}.${dec.slice(0, 2)}`;
  }
  return v.slice(0, 12);
}

/** Rebuilds the split section from a saved expense. */
function toSplitValues(expense?: ExpenseDTO): ExpenseFormValues["split"] {
  const split = expense?.split;
  if (!expense || !split) return EMPTY_SPLIT;
  const dueDate = split.dueDate ?? "";
  // Newer bills store everyone's share, so the full split can be shown again.
  if (split.shares.length > 1) {
    return {
      enabled: true,
      paidBy: split.paidBy?.id ?? "me",
      myShare: String(split.shares.find((s) => s.friendId === null)?.amount ?? expense.amount),
      participants: split.shares
        .filter((s): s is { friendId: string; amount: number } => s.friendId !== null)
        .map((s) => ({ friendId: s.friendId, share: String(s.amount) })),
      dueDate,
    };
  }
  if (split.paidBy) {
    // A friend paid: only my share and the payer are stored; the payer covers the rest of the bill.
    return {
      enabled: true,
      paidBy: split.paidBy.id,
      myShare: String(expense.amount),
      participants: [{ friendId: split.paidBy.id, share: String(Math.round((split.total - expense.amount) * 100) / 100) }],
      dueDate,
    };
  }
  return {
    enabled: true,
    paidBy: "me",
    myShare: String(expense.amount),
    participants: split.participants.map((p) => ({ friendId: p.friend.id, share: String(p.share) })),
    dueDate,
  };
}

function splitFriends(expense?: ExpenseDTO): FriendDTO[] {
  const split = expense?.split;
  if (!split) return [];
  const all = [...split.participants.map((p) => p.friend), ...(split.paidBy ? [split.paidBy] : [])];
  return [...new Map(all.map((f) => [f.id, f])).values()];
}

function toFormValues(expense?: ExpenseDTO, defaults?: Partial<ExpenseFormValues>): ExpenseFormValues {
  return {
    amount: expense ? String(expense.split ? expense.split.total : expense.amount) : "",
    description: expense?.description ?? "",
    date: expense?.date ?? todayInput(),
    categoryId: expense?.category.id ?? "",
    walletId: expense?.wallet?.id ?? "",
    groupId: expense?.group?.id ?? "",
    notes: expense?.notes ?? "",
    split: toSplitValues(expense),
    ...defaults,
  };
}

type ExpenseFormProps = {
  expense?: ExpenseDTO;
  /** Prefilled values for a new expense (e.g. paying a recurring bill, adding to a group). */
  defaults?: Partial<ExpenseFormValues>;
  /** Pays this recurring bill: links the expense and moves the bill to its next date. */
  recurringId?: string;
  onSuccess?: (expense: ExpenseDTO) => void;
  onCancel?: () => void;
  submitLabel?: string;
  /** Reset to a blank form after a successful create (for "add another"). */
  resetOnSuccess?: boolean;
  className?: string;
};

export function ExpenseForm({
  expense,
  defaults,
  recurringId,
  onSuccess,
  onCancel,
  submitLabel,
  resetOnSuccess = false,
  className,
}: ExpenseFormProps) {
  const isEdit = Boolean(expense);
  const [isPending, startTransition] = useTransition();
  const [dateOpen, setDateOpen] = useState(false);
  const [dueOpen, setDueOpen] = useState(false);

  const form = useForm<ExpenseFormValues>({
    resolver: zodResolver(expenseFormSchema),
    defaultValues: toFormValues(expense, defaults),
    mode: "onTouched",
  });
  const amount = useWatch({ control: form.control, name: "amount" });
  const splitEnabled = useWatch({ control: form.control, name: "split.enabled" });
  const groupId = useWatch({ control: form.control, name: "groupId" });
  const lookups = useLookups();
  // Archived categories/wallets are hidden, except the one an edited expense already uses.
  const categories = lookups.categories.filter((c) => !c.archived || c.id === expense?.category.id);
  const wallets = lookups.wallets.filter((w) => !w.archived || w.id === expense?.wallet?.id);
  const defaultWalletId =
    (lookups.lastWalletId && wallets.some((w) => w.id === lookups.lastWalletId) && lookups.lastWalletId) ||
    wallets[0]?.id ||
    "";

  // New expenses start in the most recently used wallet (lookups load after the first render).
  useEffect(() => {
    if (!isEdit && lookups.ready && !form.getValues("walletId") && !form.formState.dirtyFields.walletId) {
      form.setValue("walletId", defaultWalletId);
    }
  }, [isEdit, lookups.ready, defaultWalletId, form]);

  const onSubmit = form.handleSubmit((values) => {
    startTransition(async () => {
      const result = expense
        ? await updateExpense(expense.id, values)
        : await createExpense(values, recurringId ? { recurringId } : {});

      if (!result.ok) {
        if (result.fieldErrors) {
          for (const [name, messages] of Object.entries(result.fieldErrors)) {
            if (messages?.[0]) {
              // Paths may be nested, e.g. "split.participants.0.share".
              form.setError(name as Parameters<typeof form.setError>[0], { message: messages[0] });
            }
          }
        }
        toast.error(result.error);
        return;
      }

      toast.success(result.message, {
        description: `${result.data.description} · ${formatExpenseDate(result.data.date)}`,
      });
      for (const w of result.warnings ?? []) toast.warning(w, { duration: 8000 });
      if (resetOnSuccess && !isEdit) {
        form.reset({ ...toFormValues(), date: values.date, walletId: values.walletId });
      }
      onSuccess?.(result.data);
    });
  });

  return (
    <>
    <form onSubmit={onSubmit} noValidate className={cn("flex flex-col gap-6", className)}>
      <FieldGroup className="gap-5">
        {/* Amount */}
        <Controller
          control={form.control}
          name="amount"
          render={({ field, fieldState }) => (
            <Field data-invalid={fieldState.invalid}>
              <FieldLabel htmlFor="expense-amount">
                {splitEnabled ? "Total bill" : "Amount"} <span className="text-destructive">*</span>
              </FieldLabel>
              <div className="relative">
                <span className="pointer-events-none absolute inset-y-0 left-3 flex items-center text-sm font-medium text-muted-foreground">
                  Rs.
                </span>
                <Input
                  id="expense-amount"
                  inputMode="decimal"
                  autoComplete="off"
                  placeholder="0.00"
                  className="h-11 pl-11 text-lg font-semibold tabular-nums"
                  aria-invalid={fieldState.invalid}
                  {...field}
                  onChange={(e) => field.onChange(sanitizeAmount(e.target.value))}
                />
              </div>
              <FieldError errors={[fieldState.error]} />
            </Field>
          )}
        />

        {/* Split with friends */}
        <Controller
          control={form.control}
          name="split"
          render={({ field, formState }) => {
            const e = formState.errors.split;
            return (
              <SplitEditor
                value={field.value}
                onChange={field.onChange}
                groupId={groupId}
                onGroupChange={(id) => form.setValue("groupId", id, { shouldDirty: true })}
                total={Number(amount)}
                initialFriends={splitFriends(expense)}
                onPaidForSomeone={isEdit ? undefined : () => setDueOpen(true)}
                errors={{
                  participants: e?.participants?.message ?? e?.participants?.root?.message,
                  myShare: e?.myShare?.message,
                  paidBy: e?.paidBy?.message,
                  shares: Object.fromEntries(
                    (Array.isArray(e?.participants) ? e.participants : []).map((pe, i) => [i, pe?.share?.message]),
                  ),
                }}
              />
            );
          }}
        />

        {/* Description */}
        <Controller
          control={form.control}
          name="description"
          render={({ field, fieldState }) => (
            <Field data-invalid={fieldState.invalid}>
              <FieldLabel htmlFor="expense-description">
                Description <span className="text-destructive">*</span>
              </FieldLabel>
              <Input
                id="expense-description"
                placeholder="e.g. Lunch with team at Monal"
                maxLength={200}
                aria-invalid={fieldState.invalid}
                {...field}
              />
              <FieldError errors={[fieldState.error]} />
            </Field>
          )}
        />

        {/* Category */}
        <Controller
          control={form.control}
          name="categoryId"
          render={({ field, fieldState }) => (
            <Field data-invalid={fieldState.invalid}>
              <div className="flex items-center justify-between">
                <FieldLabel id="expense-category-label">
                  Category <span className="text-destructive">*</span>
                </FieldLabel>
                <Link
                  href="/settings/categories"
                  className="inline-flex items-center gap-1 text-xs text-muted-foreground hover:text-foreground"
                >
                  <Settings2 className="size-3.5" />
                  Manage
                </Link>
              </div>
              <div
                role="radiogroup"
                aria-labelledby="expense-category-label"
                className="grid grid-cols-2 gap-2 sm:grid-cols-3"
              >
                {!lookups.ready &&
                  Array.from({ length: 9 }, (_, i) => <Skeleton key={i} className="h-[38px] rounded-lg" />)}
                {categories.map((c) => {
                  const Icon = categoryIcon(c.icon);
                  const selected = field.value === c.id;
                  return (
                    <button
                      key={c.id}
                      type="button"
                      role="radio"
                      aria-checked={selected}
                      onClick={() => field.onChange(c.id)}
                      onBlur={field.onBlur}
                      className={cn(
                        "flex items-center gap-2 rounded-lg border px-3 py-2 text-left text-sm transition-colors",
                        "hover:bg-muted/60 focus-visible:ring-3 focus-visible:ring-ring/50 focus-visible:outline-none",
                        selected
                          ? "border-primary bg-primary/5 font-medium text-foreground"
                          : "border-border text-muted-foreground",
                      )}
                    >
                      <Icon className="size-4 shrink-0" style={{ color: c.color }} />
                      <span className="truncate">{c.name}</span>
                    </button>
                  );
                })}
              </div>
              <FieldError errors={[fieldState.error]} />
            </Field>
          )}
        />

        <div className="grid gap-5 sm:grid-cols-2">
          {/* Date */}
          <Controller
            control={form.control}
            name="date"
            render={({ field, fieldState }) => (
              <Field data-invalid={fieldState.invalid}>
                <FieldLabel htmlFor="expense-date">
                  Date <span className="text-destructive">*</span>
                </FieldLabel>
                <Popover open={dateOpen} onOpenChange={setDateOpen}>
                  <PopoverTrigger asChild>
                    <Button
                      id="expense-date"
                      type="button"
                      variant="outline"
                      aria-invalid={fieldState.invalid}
                      className="h-9 w-full justify-start font-normal"
                    >
                      <CalendarIcon className="text-muted-foreground" />
                      {field.value ? formatExpenseDate(field.value, {
                        weekday: "short",
                        day: "numeric",
                        month: "short",
                        year: "numeric",
                      }) : "Pick a date"}
                    </Button>
                  </PopoverTrigger>
                  <PopoverContent className="w-auto p-0" align="start">
                    <Calendar
                      mode="single"
                      selected={field.value ? dateInputToLocal(field.value) : undefined}
                      defaultMonth={field.value ? dateInputToLocal(field.value) : undefined}
                      captionLayout="dropdown"
                      startMonth={new Date(2000, 0)}
                      endMonth={new Date(new Date().getFullYear() + 1, 11)}
                      onSelect={(d) => {
                        if (d) {
                          field.onChange(localToDateInput(d));
                          setDateOpen(false);
                        }
                      }}
                    />
                    <div className="flex justify-end border-t p-2">
                      <Button
                        type="button"
                        size="sm"
                        variant="ghost"
                        onClick={() => {
                          field.onChange(todayInput());
                          setDateOpen(false);
                        }}
                      >
                        Today
                      </Button>
                    </div>
                  </PopoverContent>
                </Popover>
                <FieldError errors={[fieldState.error]} />
              </Field>
            )}
          />

          {/* Wallet */}
          <Controller
            control={form.control}
            name="walletId"
            render={({ field, fieldState }) => (
              <Field data-invalid={fieldState.invalid}>
                <FieldLabel htmlFor="expense-wallet">
                  {splitEnabled ? "Paid from" : "Wallet"}{" "}
                  <span className="font-normal text-muted-foreground">(optional)</span>
                </FieldLabel>
                <Select
                  value={field.value === "" ? NO_WALLET : field.value}
                  onValueChange={(v) => field.onChange(v === NO_WALLET ? "" : v)}
                >
                  <SelectTrigger id="expense-wallet" className="w-full" aria-invalid={fieldState.invalid}>
                    <SelectValue placeholder="Not specified">
                      {wallets.find((w) => w.id === field.value)?.name ?? "Not specified"}
                    </SelectValue>
                  </SelectTrigger>
                  <SelectContent>
                    <SelectItem value={NO_WALLET}>Not specified</SelectItem>
                    {wallets.map((w) => (
                      <SelectItem key={w.id} value={w.id}>
                        <span className="size-2 rounded-full" style={{ backgroundColor: w.color }} />
                        {w.name}
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>
                <FieldError errors={[fieldState.error]} />
              </Field>
            )}
          />
        </div>

        {/* Notes */}
        <Controller
          control={form.control}
          name="notes"
          render={({ field, fieldState }) => (
            <Field data-invalid={fieldState.invalid}>
              <FieldLabel htmlFor="expense-notes">
                Notes <span className="font-normal text-muted-foreground">(optional)</span>
              </FieldLabel>
              <Textarea
                id="expense-notes"
                rows={3}
                maxLength={1000}
                placeholder="Any extra details worth remembering"
                className="resize-none"
                aria-invalid={fieldState.invalid}
                {...field}
              />
              <FieldError errors={[fieldState.error]} />
            </Field>
          )}
        />
      </FieldGroup>

      <div className="flex flex-col-reverse gap-2 sm:flex-row sm:justify-end">
        {onCancel && (
          <Button type="button" variant="ghost" onClick={onCancel} disabled={isPending}>
            Cancel
          </Button>
        )}
        <Button type="submit" disabled={isPending} className="sm:min-w-32">
          {isPending && <Loader2 className="animate-spin" />}
          {submitLabel ?? (isEdit ? "Save changes" : "Add expense")}
        </Button>
      </div>
    </form>

    {/* Rendered outside <form>: portal events bubble through the React tree and would submit the expense form. */}
    {!isEdit && (
      <AddDueDialog
        open={dueOpen}
        onOpenChange={setDueOpen}
        defaults={{
          amount: form.getValues("amount"),
          description: form.getValues("description"),
          date: form.getValues("date"),
          walletId: form.getValues("walletId"),
        }}
        onCreated={() => {
          // Nothing is saved as an expense: close the quick-add dialog, or clear the full-page form.
          if (onCancel && !resetOnSuccess) onCancel();
          else form.reset({ ...toFormValues(), date: form.getValues("date") });
        }}
      />
    )}
    </>
  );
}
