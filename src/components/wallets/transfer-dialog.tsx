"use client";

import { ArrowDown, Loader2 } from "lucide-react";
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
import { WalletSelect } from "@/components/wallets/wallet-select";
import { todayInput } from "@/lib/dates";
import { createTransfer } from "@/server/actions/wallets";

type Errors = Record<string, string | undefined>;

function TransferForm({ fromId, onDone }: { fromId?: string; onDone: () => void }) {
  const { wallets } = useLookups();
  const active = wallets.filter((w) => !w.archived);
  const [from, setFrom] = useState(fromId ?? active[0]?.id ?? "");
  const [to, setTo] = useState(active.find((w) => w.id !== (fromId ?? active[0]?.id))?.id ?? "");
  const [amount, setAmount] = useState("");
  const [date, setDate] = useState(todayInput());
  const [note, setNote] = useState("");
  const [errors, setErrors] = useState<Errors>({});
  const [isPending, startTransition] = useTransition();
  const clear = (k: string) => setErrors((e) => (e[k] ? { ...e, [k]: undefined } : e));

  const submit = () =>
    startTransition(async () => {
      const result = await createTransfer({ fromWalletId: from, toWalletId: to, amount, date, note });
      if (!result.ok) {
        setErrors(Object.fromEntries(Object.entries(result.fieldErrors ?? {}).map(([k, v]) => [k, v?.[0]])));
        toast.error(result.error);
        return;
      }
      toast.success(result.message);
      onDone();
    });

  if (active.length < 2) {
    return (
      <p className="rounded-md bg-muted/60 px-3 py-3 text-sm text-muted-foreground">
        Add at least two wallets to move money between them.
      </p>
    );
  }

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
        <Field data-invalid={Boolean(errors.fromWalletId)}>
          <FieldLabel htmlFor="transfer-from">From</FieldLabel>
          <WalletSelect
            id="transfer-from"
            value={from}
            allowNone={false}
            showBalance
            onChange={(v) => {
              setFrom(v);
              if (v === to) setTo("");
              clear("fromWalletId");
            }}
          />
          {errors.fromWalletId && <FieldError>{errors.fromWalletId}</FieldError>}
        </Field>
        <ArrowDown className="mx-auto -my-2 size-4 text-muted-foreground" aria-hidden />
        <Field data-invalid={Boolean(errors.toWalletId)}>
          <FieldLabel htmlFor="transfer-to">To</FieldLabel>
          <WalletSelect
            id="transfer-to"
            value={to}
            allowNone={false}
            showBalance
            exclude={from}
            invalid={Boolean(errors.toWalletId)}
            onChange={(v) => {
              setTo(v);
              clear("toWalletId");
            }}
          />
          {errors.toWalletId && <FieldError>{errors.toWalletId}</FieldError>}
        </Field>
        <div className="grid gap-4 sm:grid-cols-2">
          <Field data-invalid={Boolean(errors.amount)}>
            <FieldLabel htmlFor="transfer-amount">Amount</FieldLabel>
            <div className="relative">
              <span className="pointer-events-none absolute inset-y-0 left-3 flex items-center text-sm text-muted-foreground">
                Rs.
              </span>
              <Input
                id="transfer-amount"
                inputMode="decimal"
                placeholder="0.00"
                value={amount}
                onChange={(e) => {
                  setAmount(e.target.value.replace(/[^\d.]/g, "").slice(0, 12));
                  clear("amount");
                }}
                className="pl-11 tabular-nums"
                aria-invalid={Boolean(errors.amount)}
                autoFocus
              />
            </div>
            {errors.amount && <FieldError>{errors.amount}</FieldError>}
          </Field>
          <Field data-invalid={Boolean(errors.date)}>
            <FieldLabel htmlFor="transfer-date">Date</FieldLabel>
            <Input
              id="transfer-date"
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
        </div>
        <Field>
          <FieldLabel htmlFor="transfer-note">
            Note <span className="font-normal text-muted-foreground">(optional)</span>
          </FieldLabel>
          <Input
            id="transfer-note"
            maxLength={200}
            placeholder="e.g. ATM withdrawal"
            value={note}
            onChange={(e) => setNote(e.target.value)}
          />
        </Field>
      </FieldGroup>
      <DialogFooter>
        <Button type="button" variant="ghost" onClick={onDone} disabled={isPending}>
          Cancel
        </Button>
        <Button type="submit" disabled={isPending}>
          {isPending && <Loader2 className="animate-spin" />}
          Move money
        </Button>
      </DialogFooter>
    </form>
  );
}

export function TransferDialog({
  open,
  onOpenChange,
  fromId,
}: {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  fromId?: string;
}) {
  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-h-[92dvh] overflow-y-auto sm:max-w-md">
        <DialogHeader>
          <DialogTitle>Move money</DialogTitle>
          <DialogDescription>
            Transfers between your own wallets, like an ATM withdrawal. Not counted as income or spending.
          </DialogDescription>
        </DialogHeader>
        {open && <TransferForm fromId={fromId} onDone={() => onOpenChange(false)} />}
      </DialogContent>
    </Dialog>
  );
}
