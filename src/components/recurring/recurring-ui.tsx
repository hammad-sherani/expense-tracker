"use client";

import {
  CalendarClock,
  Check,
  Loader2,
  MoreVertical,
  Pause,
  Pencil,
  Play,
  Plus,
  Repeat,
  SkipForward,
  Trash2,
} from "lucide-react";
import Link from "next/link";
import { useState, useTransition } from "react";
import { toast } from "sonner";
import { CategoryIcon } from "@/components/expenses/category-badge";
import { useExpenseUI } from "@/components/expenses/expense-dialogs";
import { useLookups } from "@/components/layout/lookups";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card, CardAction, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import { Field, FieldError, FieldGroup, FieldLabel } from "@/components/ui/field";
import { Input } from "@/components/ui/input";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { WalletSelect } from "@/components/wallets/wallet-select";
import { categoryIcon } from "@/lib/category-icons";
import { dateInputToUTC, formatExpenseDate, todayInput } from "@/lib/dates";
import { formatCurrency } from "@/lib/format";
import { describeFrequency, FREQUENCY_LABELS, type FrequencyValue, occurrence } from "@/lib/recurrence";
import { cn } from "@/lib/utils";
import {
  createRecurring,
  deleteRecurring,
  setRecurringActive,
  skipRecurring,
  updateRecurring,
} from "@/server/actions/recurring";
import type { RecurringDTO, RecurringStatus } from "@/server/queries/recurring";

type Errors = Record<string, string | undefined>;

function RecurringForm({ bill, onDone }: { bill?: RecurringDTO; onDone: () => void }) {
  const { categories, wallets, lastWalletId } = useLookups();
  const [description, setDescription] = useState(bill?.description ?? "");
  const [amount, setAmount] = useState(bill ? String(bill.amount) : "");
  const [categoryId, setCategoryId] = useState(bill?.category?.id ?? "");
  const [walletId, setWalletId] = useState(bill ? (bill.wallet?.id ?? "") : (lastWalletId ?? wallets[0]?.id ?? ""));
  const [frequency, setFrequency] = useState<FrequencyValue>(bill?.frequency ?? "MONTHLY");
  const [interval, setInterval] = useState(String(bill?.interval ?? 1));
  const [startDate, setStartDate] = useState(bill?.startDate ?? todayInput());
  const [endDate, setEndDate] = useState(bill?.endDate ?? "");
  const [notes, setNotes] = useState(bill?.notes ?? "");
  const [errors, setErrors] = useState<Errors>({});
  const [isPending, startTransition] = useTransition();
  const clear = (k: string) => setErrors((e) => (e[k] ? { ...e, [k]: undefined } : e));
  const options = categories.filter((c) => !c.archived || c.id === categoryId);
  const selectedCategory = options.find((c) => c.id === categoryId);

  let preview: string[] = [];
  const n = Number(interval);
  if (/^\d{4}-\d{2}-\d{2}$/.test(startDate) && Number.isInteger(n) && n >= 1 && n <= 24) {
    const start = dateInputToUTC(startDate);
    preview = [0, 1, 2].map((i) => formatExpenseDate(occurrence(start, frequency, n, i), { day: "numeric", month: "short", year: "numeric" }));
  }

  const submit = () =>
    startTransition(async () => {
      const values = { description, amount, categoryId, walletId, frequency, interval, startDate, endDate, notes };
      const r = bill ? await updateRecurring(bill.id, values) : await createRecurring(values);
      if (!r.ok) {
        setErrors(Object.fromEntries(Object.entries(r.fieldErrors ?? {}).map(([k, v]) => [k, v?.[0]])));
        toast.error(r.error);
        return;
      }
      toast.success(r.message);
      onDone();
    });

  return (
    <form
      noValidate
      className="flex flex-col gap-5"
      onSubmit={(e) => {
        e.preventDefault();
        submit();
      }}
    >
      <FieldGroup className="gap-4">
        <Field data-invalid={Boolean(errors.description)}>
          <FieldLabel htmlFor="rec-description">What is it?</FieldLabel>
          <Input
            id="rec-description"
            placeholder="e.g. House rent, Internet, Netflix"
            maxLength={200}
            value={description}
            onChange={(e) => {
              setDescription(e.target.value);
              clear("description");
            }}
            aria-invalid={Boolean(errors.description)}
            autoFocus
          />
          {errors.description && <FieldError>{errors.description}</FieldError>}
        </Field>
        <div className="grid gap-4 sm:grid-cols-2">
          <Field data-invalid={Boolean(errors.amount)}>
            <FieldLabel htmlFor="rec-amount">Usual amount</FieldLabel>
            <div className="relative">
              <span className="pointer-events-none absolute inset-y-0 left-3 flex items-center text-sm text-muted-foreground">
                Rs.
              </span>
              <Input
                id="rec-amount"
                inputMode="decimal"
                placeholder="0.00"
                value={amount}
                onChange={(e) => {
                  setAmount(e.target.value.replace(/[^\d.]/g, "").slice(0, 12));
                  clear("amount");
                }}
                className="pl-11 tabular-nums"
                aria-invalid={Boolean(errors.amount)}
              />
            </div>
            {errors.amount && <FieldError>{errors.amount}</FieldError>}
          </Field>
          <Field data-invalid={Boolean(errors.categoryId)}>
            <FieldLabel htmlFor="rec-category">Category</FieldLabel>
            <Select
              value={categoryId}
              onValueChange={(v) => {
                setCategoryId(v);
                clear("categoryId");
              }}
            >
              <SelectTrigger id="rec-category" className="w-full" aria-invalid={Boolean(errors.categoryId)}>
                <SelectValue placeholder="Choose">{selectedCategory?.name ?? "Choose"}</SelectValue>
              </SelectTrigger>
              <SelectContent>
                {options.map((c) => {
                  const Icon = categoryIcon(c.icon);
                  return (
                    <SelectItem key={c.id} value={c.id}>
                      <Icon style={{ color: c.color }} />
                      {c.name}
                    </SelectItem>
                  );
                })}
              </SelectContent>
            </Select>
            {errors.categoryId && <FieldError>{errors.categoryId}</FieldError>}
          </Field>
        </div>
        <Field>
          <FieldLabel id="rec-repeat-label">Repeats</FieldLabel>
          <div className="flex flex-wrap items-center gap-2" aria-labelledby="rec-repeat-label">
            <span className="text-sm text-muted-foreground">Every</span>
            <Input
              aria-label="Repeat every"
              inputMode="numeric"
              className="w-16 text-center"
              value={interval}
              onChange={(e) => {
                setInterval(e.target.value.replace(/\D/g, "").slice(0, 2));
                clear("interval");
              }}
              aria-invalid={Boolean(errors.interval)}
            />
            <div className="inline-flex rounded-lg bg-muted p-0.5" role="radiogroup" aria-label="Frequency">
              {(["WEEKLY", "MONTHLY", "YEARLY"] as const).map((f) => (
                <button
                  key={f}
                  type="button"
                  role="radio"
                  aria-checked={frequency === f}
                  onClick={() => setFrequency(f)}
                  className={cn(
                    "rounded-md px-3 py-1.5 text-xs font-medium transition-colors",
                    frequency === f ? "bg-background text-foreground shadow-xs" : "text-muted-foreground hover:text-foreground",
                  )}
                >
                  {Number(interval) > 1 ? FREQUENCY_LABELS[f].many : FREQUENCY_LABELS[f].one}
                </button>
              ))}
            </div>
          </div>
          {errors.interval && <FieldError>{errors.interval}</FieldError>}
        </Field>
        <div className="grid gap-4 sm:grid-cols-2">
          <Field data-invalid={Boolean(errors.startDate)}>
            <FieldLabel htmlFor="rec-start">{bill ? "Schedule starts" : "First due date"}</FieldLabel>
            <Input
              id="rec-start"
              type="date"
              value={startDate}
              onChange={(e) => {
                setStartDate(e.target.value);
                clear("startDate");
              }}
              aria-invalid={Boolean(errors.startDate)}
            />
            {errors.startDate && <FieldError>{errors.startDate}</FieldError>}
          </Field>
          <Field data-invalid={Boolean(errors.endDate)}>
            <FieldLabel htmlFor="rec-end">
              Ends <span className="font-normal text-muted-foreground">(optional)</span>
            </FieldLabel>
            <Input
              id="rec-end"
              type="date"
              value={endDate}
              onChange={(e) => {
                setEndDate(e.target.value);
                clear("endDate");
              }}
              aria-invalid={Boolean(errors.endDate)}
            />
            {errors.endDate && <FieldError>{errors.endDate}</FieldError>}
          </Field>
        </div>
        {preview.length > 0 && (
          <p className="flex items-center gap-2 rounded-md bg-muted/60 px-3 py-2 text-xs text-muted-foreground">
            <CalendarClock className="size-3.5 shrink-0" />
            Due {preview.join(", ")}…
          </p>
        )}
        <Field>
          <FieldLabel htmlFor="rec-wallet">
            Usually paid from <span className="font-normal text-muted-foreground">(optional)</span>
          </FieldLabel>
          <WalletSelect id="rec-wallet" value={walletId} onChange={setWalletId} noneLabel="Not specified" />
        </Field>
        <Field>
          <FieldLabel htmlFor="rec-notes">
            Notes <span className="font-normal text-muted-foreground">(optional)</span>
          </FieldLabel>
          <Input id="rec-notes" maxLength={500} value={notes} onChange={(e) => setNotes(e.target.value)} />
        </Field>
      </FieldGroup>
      <DialogFooter>
        <Button type="button" variant="ghost" onClick={onDone} disabled={isPending}>
          Cancel
        </Button>
        <Button type="submit" disabled={isPending}>
          {isPending && <Loader2 className="animate-spin" />}
          {bill ? "Save changes" : "Add recurring bill"}
        </Button>
      </DialogFooter>
    </form>
  );
}

export function RecurringDialog({
  open,
  onOpenChange,
  bill,
}: {
  open: boolean;
  onOpenChange: (o: boolean) => void;
  bill?: RecurringDTO;
}) {
  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-h-[92dvh] overflow-y-auto sm:max-w-lg">
        <DialogHeader>
          <DialogTitle>{bill ? `Edit ${bill.description}` : "New recurring bill"}</DialogTitle>
          <DialogDescription>
            Rent, bills and subscriptions. When one is due, you&apos;ll see it here to mark as paid or skip. Nothing is
            added on its own.
          </DialogDescription>
        </DialogHeader>
        {open && <RecurringForm bill={bill} onDone={() => onOpenChange(false)} />}
      </DialogContent>
    </Dialog>
  );
}

export function AddRecurringButton({ label = "New recurring bill" }: { label?: string }) {
  const [open, setOpen] = useState(false);
  return (
    <>
      <Button onClick={() => setOpen(true)}>
        <Plus />
        {label}
      </Button>
      <RecurringDialog open={open} onOpenChange={setOpen} />
    </>
  );
}

function statusLabel(bill: RecurringDTO) {
  const d = bill.daysUntil;
  const map: Record<RecurringStatus, string> = {
    overdue: `Overdue by ${-d} day${d === -1 ? "" : "s"}`,
    today: "Due today",
    soon: d === 1 ? "Due tomorrow" : `Due in ${d} days`,
    later: `Due ${formatExpenseDate(bill.nextDate, { day: "numeric", month: "short" })}`,
    paused: "Paused",
    ended: "Ended",
  };
  return map[bill.status];
}

const STATUS_STYLE: Record<RecurringStatus, string> = {
  overdue: "bg-destructive/10 text-destructive",
  today: "bg-warning/15 text-warning",
  soon: "bg-primary/10 text-primary",
  later: "bg-muted text-muted-foreground",
  paused: "bg-muted text-muted-foreground",
  ended: "bg-muted text-muted-foreground",
};

function usePayBill() {
  const { openCreate } = useExpenseUI();
  return (bill: RecurringDTO) =>
    openCreate({
      recurringId: bill.id,
      title: `Pay ${bill.description}`,
      description: `Records this ${describeFrequency(bill.frequency, bill.interval).toLowerCase()} bill as an expense. Change the amount if it was different.`,
      defaults: {
        amount: String(bill.amount),
        description: bill.description,
        categoryId: bill.category?.id ?? "",
        walletId: bill.wallet?.id ?? "",
        date: bill.status === "overdue" || bill.status === "today" ? bill.nextDate : todayInput(),
        notes: bill.notes ?? "",
      },
    });
}

function BillActions({ bill, compact = false }: { bill: RecurringDTO; compact?: boolean }) {
  const pay = usePayBill();
  const [isPending, startTransition] = useTransition();
  const run = (fn: () => Promise<{ ok: boolean; error?: string; message?: string }>) =>
    startTransition(async () => {
      const r = await fn();
      if (r.ok) toast.success(r.message);
      else toast.error(r.error);
    });
  if (!bill.active) return null;
  return (
    <div className="flex shrink-0 items-center gap-1">
      <Button size="sm" onClick={() => pay(bill)} aria-label={`Mark ${bill.description} as paid`}>
        <Check />
        <span className={cn(compact && "hidden sm:inline")}>Mark paid</span>
      </Button>
      <Button
        size="sm"
        variant="ghost"
        disabled={isPending}
        onClick={() => run(() => skipRecurring(bill.id))}
        aria-label={`Skip ${bill.description}`}
      >
        {isPending ? <Loader2 className="animate-spin" /> : <SkipForward />}
        <span className="hidden sm:inline">Skip</span>
      </Button>
    </div>
  );
}

export function RecurringRow({ bill }: { bill: RecurringDTO }) {
  const [editing, setEditing] = useState(false);
  const [isPending, startTransition] = useTransition();
  const run = (fn: () => Promise<{ ok: boolean; error?: string; message?: string }>) =>
    startTransition(async () => {
      const r = await fn();
      if (r.ok) toast.success(r.message);
      else toast.error(r.error);
    });

  return (
    <li className={cn("flex flex-wrap items-center gap-3 px-4 py-3 sm:flex-nowrap sm:px-5", !bill.active && "opacity-70")}>
      <div className="flex min-w-0 flex-1 items-center gap-3">
        {bill.category ? (
          <CategoryIcon category={bill.category} />
        ) : (
          <span className="flex size-9 items-center justify-center rounded-lg bg-muted">
            <Repeat className="size-4" />
          </span>
        )}
        <div className="min-w-0 flex-1">
          <p className="truncate text-sm font-medium">{bill.description}</p>
          <p className="truncate text-xs text-muted-foreground">
            {formatCurrency(bill.amount)} · {describeFrequency(bill.frequency, bill.interval)}
            {bill.wallet && ` · ${bill.wallet.name}`}
          </p>
        </div>
        <Badge variant="secondary" className={cn("shrink-0 border-0", STATUS_STYLE[bill.status])}>
          {statusLabel(bill)}
        </Badge>
      </div>
      <div className="ml-auto flex items-center gap-1">
        <BillActions bill={bill} />
        <DropdownMenu>
          <DropdownMenuTrigger asChild>
            <Button variant="ghost" size="icon-sm" aria-label={`Options for ${bill.description}`} disabled={isPending}>
              {isPending ? <Loader2 className="animate-spin" /> : <MoreVertical />}
            </Button>
          </DropdownMenuTrigger>
          <DropdownMenuContent align="end">
            <DropdownMenuItem onSelect={() => setEditing(true)}>
              <Pencil />
              Edit
            </DropdownMenuItem>
            {bill.status !== "ended" && (
              <DropdownMenuItem onSelect={() => run(() => setRecurringActive(bill.id, !bill.active))}>
                {bill.active ? <Pause /> : <Play />}
                {bill.active ? "Pause" : "Resume"}
              </DropdownMenuItem>
            )}
            <DropdownMenuSeparator />
            <DropdownMenuItem variant="destructive" onSelect={() => run(() => deleteRecurring(bill.id))}>
              <Trash2 />
              Delete
            </DropdownMenuItem>
          </DropdownMenuContent>
        </DropdownMenu>
      </div>
      <RecurringDialog open={editing} onOpenChange={setEditing} bill={bill} />
    </li>
  );
}

/** Dashboard card: bills overdue or due in the next 7 days. */
export function UpcomingBillsCard({ bills }: { bills: RecurringDTO[] }) {
  return (
    <Card className="gap-4">
      <CardHeader>
        <CardTitle>Upcoming bills</CardTitle>
        <CardDescription>Due in the next 7 days</CardDescription>
        <CardAction>
          <Button asChild variant="ghost" size="sm">
            <Link href="/recurring">All bills</Link>
          </Button>
        </CardAction>
      </CardHeader>
      <CardContent>
        {bills.length === 0 ? (
          <p className="py-4 text-center text-sm text-muted-foreground">Nothing due this week.</p>
        ) : (
          <ul className="-mx-2 flex flex-col">
            {bills.map((b) => (
              <li key={b.id} className="flex items-center gap-3 rounded-lg px-2 py-2">
                {b.category ? <CategoryIcon category={b.category} size="sm" /> : <Repeat className="size-4" />}
                <div className="min-w-0 flex-1">
                  <p className="truncate text-sm font-medium">{b.description}</p>
                  <p className={cn("truncate text-xs", b.status === "overdue" ? "text-destructive" : "text-muted-foreground")}>
                    {formatCurrency(b.amount)} · {statusLabel(b)}
                  </p>
                </div>
                <BillActions bill={b} compact />
              </li>
            ))}
          </ul>
        )}
      </CardContent>
    </Card>
  );
}
