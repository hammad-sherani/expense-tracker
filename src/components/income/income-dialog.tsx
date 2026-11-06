"use client";

import { Loader2 } from "lucide-react";
import { useState, useTransition } from "react";
import { toast } from "sonner";
import { useLookups } from "@/components/layout/lookups";
import { Button } from "@/components/ui/button";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { Field, FieldError, FieldGroup, FieldLabel } from "@/components/ui/field";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import { WalletSelect } from "@/components/wallets/wallet-select";
import { todayInput } from "@/lib/dates";
import { cn } from "@/lib/utils";
import { INCOME_TYPE_LABELS, INCOME_TYPES, type IncomeTypeValue } from "@/lib/wallets";
import { createIncome, updateIncome } from "@/server/actions/income";
import type { IncomeDTO } from "@/types";

type Errors = Record<string, string | undefined>;

function sanitizeAmount(raw: string): string {
  let v = raw.replace(/,/g, "").replace(/[^\d.]/g, "");
  const dot = v.indexOf(".");
  if (dot !== -1) v = v.slice(0, dot + 1) + v.slice(dot + 1).replace(/\./g, "").slice(0, 2);
  return v.slice(0, 12);
}

function IncomeForm({ income, onDone }: { income?: IncomeDTO; onDone: () => void }) {
  const { wallets, lastWalletId } = useLookups();
  const fallbackWallet = wallets.find((w) => w.type === "BANK" && !w.archived)?.id ?? lastWalletId ?? "";
  const [amount, setAmount] = useState(income ? String(income.amount) : "");
  const [source, setSource] = useState(income?.source ?? "");
  const [type, setType] = useState<IncomeTypeValue>(income?.type ?? "SALARY");
  const [walletId, setWalletId] = useState(income ? (income.wallet?.id ?? "") : fallbackWallet);
  const [date, setDate] = useState(income?.date ?? todayInput());
  const [notes, setNotes] = useState(income?.notes ?? "");
  const [errors, setErrors] = useState<Errors>({});
  const [isPending, startTransition] = useTransition();
  const clear = (k: string) => setErrors((e) => (e[k] ? { ...e, [k]: undefined } : e));

  const submit = () =>
    startTransition(async () => {
      const values = { amount, source, type, walletId, date, notes };
      const result = income ? await updateIncome(income.id, values) : await createIncome(values);
      if (!result.ok) {
        setErrors(Object.fromEntries(Object.entries(result.fieldErrors ?? {}).map(([k, v]) => [k, v?.[0]])));
        toast.error(result.error);
        return;
      }
      toast.success(result.message);
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
        <Field data-invalid={Boolean(errors.amount)}>
          <FieldLabel htmlFor="income-amount">Amount</FieldLabel>
          <div className="relative">
            <span className="pointer-events-none absolute inset-y-0 left-3 flex items-center text-sm font-medium text-muted-foreground">
              Rs.
            </span>
            <Input
              id="income-amount"
              inputMode="decimal"
              placeholder="0.00"
              value={amount}
              onChange={(e) => {
                setAmount(sanitizeAmount(e.target.value));
                clear("amount");
              }}
              className="h-11 pl-11 text-lg font-semibold tabular-nums"
              aria-invalid={Boolean(errors.amount)}
              autoFocus
            />
          </div>
          {errors.amount && <FieldError>{errors.amount}</FieldError>}
        </Field>

        <Field data-invalid={Boolean(errors.source)}>
          <FieldLabel htmlFor="income-source">Source</FieldLabel>
          <Input
            id="income-source"
            placeholder="e.g. November salary"
            maxLength={200}
            value={source}
            onChange={(e) => {
              setSource(e.target.value);
              clear("source");
            }}
            aria-invalid={Boolean(errors.source)}
          />
          {errors.source && <FieldError>{errors.source}</FieldError>}
        </Field>

        <Field>
          <FieldLabel id="income-type-label">Type</FieldLabel>
          <div role="radiogroup" aria-labelledby="income-type-label" className="flex flex-wrap gap-2">
            {INCOME_TYPES.map((t) => (
              <button
                key={t}
                type="button"
                role="radio"
                aria-checked={type === t}
                onClick={() => setType(t)}
                className={cn(
                  "rounded-full border px-3 py-1 text-xs font-medium transition-colors",
                  type === t ? "border-primary bg-primary/10 text-foreground" : "text-muted-foreground hover:bg-muted/60",
                )}
              >
                {INCOME_TYPE_LABELS[t]}
              </button>
            ))}
          </div>
        </Field>

        <div className="grid gap-4 sm:grid-cols-2">
          <Field data-invalid={Boolean(errors.date)}>
            <FieldLabel htmlFor="income-date">Date</FieldLabel>
            <Input
              id="income-date"
              type="date"
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
            <FieldLabel htmlFor="income-wallet">Received in</FieldLabel>
            <WalletSelect
              id="income-wallet"
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

        <Field data-invalid={Boolean(errors.notes)}>
          <FieldLabel htmlFor="income-notes">
            Notes <span className="font-normal text-muted-foreground">(optional)</span>
          </FieldLabel>
          <Textarea
            id="income-notes"
            rows={2}
            maxLength={1000}
            className="resize-none"
            value={notes}
            onChange={(e) => setNotes(e.target.value)}
          />
        </Field>
      </FieldGroup>
      <DialogFooter>
        <Button type="button" variant="ghost" onClick={onDone} disabled={isPending}>
          Cancel
        </Button>
        <Button type="submit" disabled={isPending}>
          {isPending && <Loader2 className="animate-spin" />}
          {income ? "Save changes" : "Add income"}
        </Button>
      </DialogFooter>
    </form>
  );
}

export function IncomeDialog({
  open,
  onOpenChange,
  income,
}: {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  income?: IncomeDTO;
}) {
  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-h-[92dvh] overflow-y-auto sm:max-w-md">
        <DialogHeader>
          <DialogTitle>{income ? "Edit income" : "Add income"}</DialogTitle>
          <DialogDescription>Salary, freelance work, gifts or refunds: money that came in.</DialogDescription>
        </DialogHeader>
        {open && <IncomeForm income={income} onDone={() => onOpenChange(false)} />}
      </DialogContent>
    </Dialog>
  );
}
