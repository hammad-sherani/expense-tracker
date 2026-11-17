"use client";

import { Archive, ArchiveRestore, ChevronDown, Loader2, MoreVertical, Pencil, Plus, Trash2, Undo2 } from "lucide-react";
import { useState, useTransition } from "react";
import { toast } from "sonner";
import { useLookups } from "@/components/layout/lookups";
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
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card } from "@/components/ui/card";
import { Collapsible, CollapsibleContent, CollapsibleTrigger } from "@/components/ui/collapsible";
import { Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import { Field, FieldDescription, FieldError, FieldGroup, FieldLabel } from "@/components/ui/field";
import { Input } from "@/components/ui/input";
import { WalletSelect } from "@/components/wallets/wallet-select";
import { dateInputToUTC, formatExpenseDate, todayInput } from "@/lib/dates";
import { formatCurrency } from "@/lib/format";
import { loanDueDate, monthlyInterest, monthsToPayOff } from "@/lib/loans";
import { cn } from "@/lib/utils";
import { createLoan, deleteLoan, payLoan, setLoanArchived, undoLoanPayment, updateLoan } from "@/server/actions/loans";
import type { LoanDTO, LoanStatus } from "@/server/queries/loans";
import type { ActionResult } from "@/types";

type Errors = Record<string, string | undefined>;

const monthYear = (d: string | Date) => formatExpenseDate(d, { month: "short", year: "numeric" });
const dayMonth = (d: string | Date) => formatExpenseDate(d, { day: "numeric", month: "short" });
const money = (raw: string) => raw.replace(/[^\d.]/g, "").slice(0, 12);
const round2 = (n: number) => Math.round(n * 100) / 100;

function useSubmit() {
  const [errors, setErrors] = useState<Errors>({});
  const [isPending, startTransition] = useTransition();
  const clear = (k: string) => setErrors((e) => (e[k] ? { ...e, [k]: undefined } : e));
  const submit = <T,>(fn: () => Promise<ActionResult<T>>, onDone: () => void) =>
    startTransition(async () => {
      const r = await fn();
      if (!r.ok) {
        setErrors(Object.fromEntries(Object.entries(r.fieldErrors ?? {}).map(([k, v]) => [k, v?.[0]])));
        toast.error(r.error);
        return;
      }
      toast.success(r.message);
      onDone();
    });
  return { errors, clear, isPending, submit };
}

function useRun() {
  const [isPending, startTransition] = useTransition();
  const run = (fn: () => Promise<{ ok: boolean; error?: string; message?: string }>, after?: () => void) =>
    startTransition(async () => {
      const r = await fn();
      if (r.ok) {
        toast.success(r.message);
        after?.();
      } else toast.error(r.error);
    });
  return { isPending, run };
}

function RupeeInput({
  id,
  value,
  onChange,
  invalid,
  autoFocus,
  placeholder = "0.00",
}: {
  id: string;
  value: string;
  onChange: (v: string) => void;
  invalid: boolean;
  autoFocus?: boolean;
  placeholder?: string;
}) {
  return (
    <div className="relative">
      <span className="pointer-events-none absolute inset-y-0 left-3 flex items-center text-sm text-muted-foreground">Rs.</span>
      <Input
        id={id}
        inputMode="decimal"
        placeholder={placeholder}
        value={value}
        onChange={(e) => onChange(money(e.target.value))}
        className="pl-11 tabular-nums"
        aria-invalid={invalid}
        autoFocus={autoFocus}
      />
    </div>
  );
}

function LoanForm({ loan, onDone }: { loan?: LoanDTO; onDone: () => void }) {
  const [name, setName] = useState(loan?.name ?? "");
  const [lender, setLender] = useState(loan?.lender ?? "");
  const [principal, setPrincipal] = useState(loan ? String(loan.principal) : "");
  const [rate, setRate] = useState(loan ? String(loan.annualRatePct) : "");
  const [installment, setInstallment] = useState(loan ? String(loan.monthlyInstallment) : "");
  const [startDate, setStartDate] = useState(loan?.startDate ?? todayInput());
  const [walletId, setWalletId] = useState(loan?.receivedWallet?.id ?? "");
  const [repaidBefore, setRepaidBefore] = useState(loan?.alreadyRepaid ? String(loan.alreadyRepaid) : "");
  const [notes, setNotes] = useState(loan?.notes ?? "");
  const { errors, clear, isPending, submit } = useSubmit();
  const dateLocked = Boolean(loan && loan.payments.length > 0);

  const owed = Number(principal) - Number(repaidBefore || 0);
  const pct = Number(rate || 0);
  const months = owed > 0 && Number(installment) > 0 ? monthsToPayOff(owed, pct, Number(installment)) : undefined;
  const validDate = /^\d{4}-\d{2}-\d{2}$/.test(startDate);

  const values = {
    name,
    lender,
    principal,
    annualRatePct: rate,
    monthlyInstallment: installment,
    startDate,
    receivedWalletId: walletId,
    alreadyRepaid: repaidBefore,
    notes,
  };
  const field = (k: string, set: (v: string) => void) => (v: string) => {
    set(v);
    clear(k);
  };

  return (
    <form
      noValidate
      className="flex flex-col gap-5"
      onSubmit={(e) => {
        e.preventDefault();
        submit(() => (loan ? updateLoan(loan.id, values) : createLoan(values)), onDone);
      }}
    >
      <FieldGroup className="gap-4">
        <div className="grid gap-4 sm:grid-cols-2">
          <Field data-invalid={Boolean(errors.name)}>
            <FieldLabel htmlFor="loan-name">Name</FieldLabel>
            <Input
              id="loan-name"
              maxLength={60}
              placeholder="e.g. Bike loan"
              value={name}
              onChange={(e) => field("name", setName)(e.target.value)}
              aria-invalid={Boolean(errors.name)}
              autoFocus
            />
            {errors.name && <FieldError>{errors.name}</FieldError>}
          </Field>
          <Field>
            <FieldLabel htmlFor="loan-lender">
              Lender <span className="font-normal text-muted-foreground">(optional)</span>
            </FieldLabel>
            <Input id="loan-lender" maxLength={60} placeholder="e.g. Meezan Bank" value={lender} onChange={(e) => setLender(e.target.value)} />
          </Field>
        </div>
        <div className="grid gap-4 sm:grid-cols-2">
          <Field data-invalid={Boolean(errors.principal)}>
            <FieldLabel htmlFor="loan-principal">Loan amount</FieldLabel>
            <RupeeInput id="loan-principal" value={principal} onChange={field("principal", setPrincipal)} invalid={Boolean(errors.principal)} />
            {errors.principal && <FieldError>{errors.principal}</FieldError>}
          </Field>
          <Field data-invalid={Boolean(errors.annualRatePct)}>
            <FieldLabel htmlFor="loan-rate">Yearly interest rate</FieldLabel>
            <div className="relative">
              <Input
                id="loan-rate"
                inputMode="decimal"
                placeholder="0"
                value={rate}
                onChange={(e) => field("annualRatePct", setRate)(e.target.value.replace(/[^\d.]/g, "").slice(0, 6))}
                className="pr-8 tabular-nums"
                aria-invalid={Boolean(errors.annualRatePct)}
              />
              <span className="pointer-events-none absolute inset-y-0 right-3 flex items-center text-sm text-muted-foreground">%</span>
            </div>
            {errors.annualRatePct ? <FieldError>{errors.annualRatePct}</FieldError> : <FieldDescription>0 for an interest-free loan.</FieldDescription>}
          </Field>
        </div>
        <div className="grid gap-4 sm:grid-cols-2">
          <Field data-invalid={Boolean(errors.monthlyInstallment)}>
            <FieldLabel htmlFor="loan-installment">Monthly installment</FieldLabel>
            <RupeeInput
              id="loan-installment"
              value={installment}
              onChange={field("monthlyInstallment", setInstallment)}
              invalid={Boolean(errors.monthlyInstallment)}
            />
            {errors.monthlyInstallment && <FieldError>{errors.monthlyInstallment}</FieldError>}
          </Field>
          <Field data-invalid={Boolean(errors.startDate)}>
            <FieldLabel htmlFor="loan-start">First installment date</FieldLabel>
            <Input
              id="loan-start"
              type="date"
              value={startDate}
              disabled={dateLocked}
              onChange={(e) => field("startDate", setStartDate)(e.target.value)}
              aria-invalid={Boolean(errors.startDate)}
            />
            {errors.startDate ? (
              <FieldError>{errors.startDate}</FieldError>
            ) : (
              !loan && <FieldDescription>For a loan you&apos;re already paying, the next one.</FieldDescription>
            )}
          </Field>
        </div>
        <div className="grid gap-4 sm:grid-cols-2">
          <Field data-invalid={Boolean(errors.alreadyRepaid)}>
            <FieldLabel htmlFor="loan-repaid">
              Already repaid <span className="font-normal text-muted-foreground">(optional)</span>
            </FieldLabel>
            <RupeeInput
              id="loan-repaid"
              value={repaidBefore}
              placeholder="0"
              onChange={field("alreadyRepaid", setRepaidBefore)}
              invalid={Boolean(errors.alreadyRepaid)}
            />
            {errors.alreadyRepaid ? (
              <FieldError>{errors.alreadyRepaid}</FieldError>
            ) : (
              <FieldDescription>Loan amount paid back before you started tracking it here.</FieldDescription>
            )}
          </Field>
          <Field data-invalid={Boolean(errors.receivedWalletId)}>
            <FieldLabel htmlFor="loan-wallet">
              Money received in <span className="font-normal text-muted-foreground">(optional)</span>
            </FieldLabel>
            <WalletSelect id="loan-wallet" value={walletId} onChange={field("receivedWalletId", setWalletId)} invalid={Boolean(errors.receivedWalletId)} />
            {errors.receivedWalletId ? (
              <FieldError>{errors.receivedWalletId}</FieldError>
            ) : (
              <FieldDescription>Adds the loan amount to this wallet. Leave empty for an older loan.</FieldDescription>
            )}
          </Field>
        </div>
        {owed > 0 && Number(installment) > 0 && validDate && (
          <p className="rounded-md bg-muted/60 px-3 py-2 text-sm text-muted-foreground" data-testid="loan-preview">
            {pct > 0 && (
              <>
                First month&apos;s interest <span className="font-semibold text-foreground">{formatCurrency(monthlyInterest(owed, pct))}</span>.{" "}
              </>
            )}
            {months === null ? (
              <span className="text-destructive">This installment doesn&apos;t cover the interest, so the loan never gets paid off.</span>
            ) : (
              <>
                Paid off in <span className="font-semibold text-foreground">{months} months</span>, around{" "}
                <span className="font-semibold text-foreground">{monthYear(loanDueDate(dateInputToUTC(startDate), months ?? 1))}</span>.
              </>
            )}
          </p>
        )}
        <Field>
          <FieldLabel htmlFor="loan-notes">
            Notes <span className="font-normal text-muted-foreground">(optional)</span>
          </FieldLabel>
          <Input id="loan-notes" maxLength={500} value={notes} onChange={(e) => setNotes(e.target.value)} />
        </Field>
      </FieldGroup>
      <DialogFooter>
        <Button type="button" variant="ghost" onClick={onDone} disabled={isPending}>
          Cancel
        </Button>
        <Button type="submit" disabled={isPending}>
          {isPending && <Loader2 className="animate-spin" />}
          {loan ? "Save changes" : "Add loan"}
        </Button>
      </DialogFooter>
    </form>
  );
}

function LoanDialog({ open, onOpenChange, loan }: { open: boolean; onOpenChange: (o: boolean) => void; loan?: LoanDTO }) {
  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-h-[92dvh] overflow-y-auto sm:max-w-lg">
        <DialogHeader>
          <DialogTitle>{loan ? `Edit ${loan.name}` : "Add a loan"}</DialogTitle>
          <DialogDescription>Money you borrowed. Paying it back isn&apos;t counted as spending; only the interest is.</DialogDescription>
        </DialogHeader>
        {open && <LoanForm loan={loan} onDone={() => onOpenChange(false)} />}
      </DialogContent>
    </Dialog>
  );
}

export function AddLoanButton({ label = "Add loan" }: { label?: string }) {
  const [open, setOpen] = useState(false);
  return (
    <>
      <Button onClick={() => setOpen(true)}>
        <Plus />
        {label}
      </Button>
      <LoanDialog open={open} onOpenChange={setOpen} />
    </>
  );
}

function PayForm({ loan, onDone }: { loan: LoanDTO; onDone: () => void }) {
  const { lastWalletId } = useLookups();
  const next = loan.next!;
  const [amount, setAmount] = useState(String(next.amount));
  const [interest, setInterest] = useState(String(next.interest));
  const [date, setDate] = useState(todayInput());
  const [walletId, setWalletId] = useState(loan.payments.find((p) => p.wallet)?.wallet?.id ?? lastWalletId ?? "");
  const { errors, clear, isPending, submit } = useSubmit();
  const repays = round2(Number(amount || 0) - Number(interest || 0));

  return (
    <form
      noValidate
      className="flex flex-col gap-5"
      onSubmit={(e) => {
        e.preventDefault();
        submit(() => payLoan(loan.id, { amount, interest, date, walletId }), onDone);
      }}
    >
      <FieldGroup className="gap-4">
        <div className="grid gap-4 sm:grid-cols-2">
          <Field data-invalid={Boolean(errors.amount)}>
            <FieldLabel htmlFor="loan-pay-amount">Amount paid</FieldLabel>
            <RupeeInput
              id="loan-pay-amount"
              value={amount}
              onChange={(v) => {
                setAmount(v);
                clear("amount");
              }}
              invalid={Boolean(errors.amount)}
              autoFocus
            />
            {errors.amount && <FieldError>{errors.amount}</FieldError>}
          </Field>
          <Field data-invalid={Boolean(errors.interest)}>
            <FieldLabel htmlFor="loan-pay-interest">Of which interest</FieldLabel>
            <RupeeInput
              id="loan-pay-interest"
              value={interest}
              placeholder="0"
              onChange={(v) => {
                setInterest(v);
                clear("interest");
              }}
              invalid={Boolean(errors.interest)}
            />
            {errors.interest ? <FieldError>{errors.interest}</FieldError> : <FieldDescription>Change it to match your statement.</FieldDescription>}
          </Field>
        </div>
        <div className="grid gap-4 sm:grid-cols-2">
          <Field data-invalid={Boolean(errors.date)}>
            <FieldLabel htmlFor="loan-pay-date">Date</FieldLabel>
            <Input
              id="loan-pay-date"
              type="date"
              max={todayInput()}
              value={date}
              onChange={(e) => {
                setDate(e.target.value);
                clear("date");
              }}
              aria-invalid={Boolean(errors.date)}
            />
            {errors.date && <FieldError>{errors.date}</FieldError>}
          </Field>
          <Field data-invalid={Boolean(errors.walletId)}>
            <FieldLabel htmlFor="loan-pay-wallet">
              Paid from <span className="font-normal text-muted-foreground">(optional)</span>
            </FieldLabel>
            <WalletSelect
              id="loan-pay-wallet"
              value={walletId}
              onChange={(v) => {
                setWalletId(v);
                clear("walletId");
              }}
              invalid={Boolean(errors.walletId)}
            />
            {errors.walletId && <FieldError>{errors.walletId}</FieldError>}
          </Field>
        </div>
        <p className="rounded-md bg-muted/60 px-3 py-2 text-sm text-muted-foreground" data-testid="loan-pay-split">
          <span className="font-semibold text-foreground">{formatCurrency(Math.max(0, repays))}</span> repays the loan
          {Number(interest) > 0 && (
            <>
              , <span className="font-semibold text-foreground">{formatCurrency(Number(interest))}</span> is added as a &quot;Loan interest&quot; expense
            </>
          )}
          .
        </p>
      </FieldGroup>
      <DialogFooter>
        <Button type="button" variant="ghost" onClick={onDone} disabled={isPending}>
          Cancel
        </Button>
        <Button type="submit" disabled={isPending}>
          {isPending && <Loader2 className="animate-spin" />}
          Record payment
        </Button>
      </DialogFooter>
    </form>
  );
}

/** Pays the next installment. Shown on the Loans page and in Upcoming bills. */
export function PayLoanButton({ loan }: { loan: LoanDTO }) {
  const [open, setOpen] = useState(false);
  if (!loan.next) return null;
  return (
    <>
      <Button size="sm" onClick={() => setOpen(true)} aria-label={`Pay ${loan.name}`}>
        Pay
      </Button>
      <Dialog open={open} onOpenChange={setOpen}>
        <DialogContent className="max-h-[92dvh] overflow-y-auto sm:max-w-md">
          <DialogHeader>
            <DialogTitle>Pay {loan.name}</DialogTitle>
            <DialogDescription>
              {formatCurrency(loan.balance)} still owed
              {loan.annualRatePct > 0 ? `, at ${loan.annualRatePct}% a year.` : ", interest free."}
            </DialogDescription>
          </DialogHeader>
          {open && <PayForm loan={loan} onDone={() => setOpen(false)} />}
        </DialogContent>
      </Dialog>
    </>
  );
}

const STATUS_STYLE: Record<LoanStatus, string> = {
  overdue: "bg-destructive/10 text-destructive",
  today: "bg-warning/15 text-warning",
  soon: "bg-primary/10 text-primary",
  later: "bg-muted text-muted-foreground",
  done: "bg-success/10 text-success",
};

export function loanDueText(l: LoanDTO) {
  const d = l.daysUntil ?? 0;
  if (l.status === "done") return "Paid off";
  if (l.status === "overdue") return `Overdue by ${-d} day${d === -1 ? "" : "s"}`;
  if (l.status === "today") return "Due today";
  if (d === 1) return "Due tomorrow";
  if (l.status === "soon") return `Due in ${d} days`;
  return `Due ${dayMonth(l.nextDate!)}`;
}

export function LoanCard({ loan: l }: { loan: LoanDTO }) {
  const [editing, setEditing] = useState(false);
  const [deleting, setDeleting] = useState(false);
  const [open, setOpen] = useState(false);
  const { isPending, run } = useRun();

  return (
    <Card className={cn("gap-3 px-5 py-4", l.archived && "opacity-70")} data-testid="loan-card">
      <div className="flex items-start gap-3">
        <div className="min-w-0 flex-1">
          <p className="truncate font-medium">{l.name}</p>
          <p className="truncate text-xs text-muted-foreground">
            {[l.lender, `${formatCurrency(l.monthlyInstallment)} a month`, l.annualRatePct > 0 ? `${l.annualRatePct}% a year` : "Interest free"]
              .filter(Boolean)
              .join(" · ")}
          </p>
        </div>
        <Badge variant="secondary" className={cn("shrink-0 border-0", STATUS_STYLE[l.status])}>
          {loanDueText(l)}
        </Badge>
        <DropdownMenu>
          <DropdownMenuTrigger asChild>
            <Button variant="ghost" size="icon-sm" aria-label={`Options for ${l.name}`} disabled={isPending}>
              {isPending ? <Loader2 className="animate-spin" /> : <MoreVertical />}
            </Button>
          </DropdownMenuTrigger>
          <DropdownMenuContent align="end">
            <DropdownMenuItem onSelect={() => setEditing(true)}>
              <Pencil />
              Edit
            </DropdownMenuItem>
            {(l.finished || l.archived) && (
              <DropdownMenuItem onSelect={() => run(() => setLoanArchived(l.id, !l.archived))}>
                {l.archived ? <ArchiveRestore /> : <Archive />}
                {l.archived ? "Restore" : "Archive"}
              </DropdownMenuItem>
            )}
            <DropdownMenuSeparator />
            <DropdownMenuItem variant="destructive" onSelect={() => setDeleting(true)}>
              <Trash2 />
              Delete
            </DropdownMenuItem>
          </DropdownMenuContent>
        </DropdownMenu>
      </div>

      <div>
        <div className="flex items-baseline justify-between gap-2 text-sm">
          <span className="font-medium tabular-nums" data-testid="loan-balance">
            {formatCurrency(l.balance)} left
          </span>
          <span className="text-xs text-muted-foreground tabular-nums">of {formatCurrency(l.principal)}</span>
        </div>
        <div
          className="mt-1.5 h-2 overflow-hidden rounded-full bg-muted"
          role="progressbar"
          aria-label={`${l.name} repaid`}
          aria-valuemin={0}
          aria-valuemax={100}
          aria-valuenow={Math.round(l.percent)}
        >
          <div className="h-full rounded-full bg-primary" style={{ width: `${l.percent}%` }} />
        </div>
      </div>

      <dl className="flex flex-col gap-1 text-sm">
        {l.next && (
          <div className="flex justify-between gap-3">
            <dt className="text-muted-foreground">Next payment</dt>
            <dd className="text-right font-medium tabular-nums">
              {formatCurrency(l.next.amount)}
              {l.next.interest > 0 && <span className="font-normal text-muted-foreground"> ({formatCurrency(l.next.interest)} interest)</span>}
            </dd>
          </div>
        )}
        {!l.finished && (
          <div className="flex justify-between gap-3">
            <dt className="text-muted-foreground">Paid off by</dt>
            <dd className={cn("text-right font-medium", l.monthsLeft === null && "text-destructive")}>
              {l.monthsLeft === null ? "Never at this installment" : `${monthYear(l.payoffDate!)} · ${l.monthsLeft} months`}
            </dd>
          </div>
        )}
        <div className="flex justify-between gap-3">
          <dt className="text-muted-foreground">Interest paid so far</dt>
          <dd className="font-medium tabular-nums">{formatCurrency(l.interestPaid)}</dd>
        </div>
      </dl>

      <Collapsible open={open} onOpenChange={setOpen}>
        <div className="flex flex-wrap items-center gap-2">
          {!l.archived && <PayLoanButton loan={l} />}
          <CollapsibleTrigger asChild>
            <Button variant="ghost" size="sm" className="ml-auto" aria-label={open ? `Hide payments of ${l.name}` : `Show payments of ${l.name}`}>
              History
              <ChevronDown className={cn("transition-transform", open && "rotate-180")} />
            </Button>
          </CollapsibleTrigger>
        </div>
        <CollapsibleContent>
          <ul className="mt-3 flex flex-col divide-y border-t" aria-label={`Payments of ${l.name}`}>
            {l.payments.length === 0 && <li className="py-2 text-sm text-muted-foreground">No payments yet.</li>}
            {l.payments.map((p, i) => (
              <li key={p.id} className="flex items-center gap-2 py-2 text-sm">
                <span className="min-w-0 flex-1 truncate">
                  {formatExpenseDate(p.date)}
                  {p.wallet && ` · ${p.wallet.name}`}
                  {p.interestPart > 0 && <span className="text-muted-foreground"> · {formatCurrency(p.interestPart)} interest</span>}
                </span>
                <span className="font-medium tabular-nums">−{formatCurrency(p.amount)}</span>
                {i === 0 ? (
                  <Button variant="ghost" size="icon-sm" aria-label="Undo last payment" disabled={isPending} onClick={() => run(() => undoLoanPayment(l.id))}>
                    <Undo2 />
                  </Button>
                ) : (
                  <span className="size-7" aria-hidden />
                )}
              </li>
            ))}
            {l.alreadyRepaid > 0 && (
              <li className="py-2 text-sm text-muted-foreground">{formatCurrency(l.alreadyRepaid)} repaid before tracking</li>
            )}
            {l.receivedWallet && (
              <li className="py-2 text-sm text-muted-foreground">
                {formatCurrency(l.principal)} received in {l.receivedWallet.name}
              </li>
            )}
          </ul>
        </CollapsibleContent>
      </Collapsible>

      <LoanDialog open={editing} onOpenChange={setEditing} loan={l} />
      <AlertDialog open={deleting} onOpenChange={(o) => !isPending && setDeleting(o)}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>Delete {l.name}?</AlertDialogTitle>
            <AlertDialogDescription>
              This removes it, its {l.payments.length} recorded payments and their interest expenses, as if it never happened. Any wallet
              balances it changed go back too.
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel disabled={isPending}>Cancel</AlertDialogCancel>
            <AlertDialogAction
              variant="destructive"
              disabled={isPending}
              onClick={(e) => {
                e.preventDefault();
                run(() => deleteLoan(l.id), () => setDeleting(false));
              }}
            >
              {isPending && <Loader2 className="animate-spin" />}
              Delete
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </Card>
  );
}
