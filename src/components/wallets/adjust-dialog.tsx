"use client";

import { Loader2 } from "lucide-react";
import { useState, useTransition } from "react";
import { toast } from "sonner";
import { Button } from "@/components/ui/button";
import { Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { Field, FieldDescription, FieldError, FieldGroup, FieldLabel } from "@/components/ui/field";
import { Input } from "@/components/ui/input";
import { todayInput } from "@/lib/dates";
import { formatCurrency, roundMoney } from "@/lib/format";
import { cn } from "@/lib/utils";
import { createAdjustment } from "@/server/actions/wallets";
import type { WalletDTO } from "@/types";

type Mode = "SET" | "CREDIT" | "DEBIT";
const MODES: { value: Mode; label: string }[] = [
  { value: "SET", label: "Set balance" },
  { value: "CREDIT", label: "Add (credit)" },
  { value: "DEBIT", label: "Take out (debit)" },
];
type Errors = Record<string, string | undefined>;

function AdjustForm({ wallet, onDone }: { wallet: WalletDTO; onDone: () => void }) {
  const [mode, setMode] = useState<Mode>("SET");
  const [amount, setAmount] = useState("");
  const [date, setDate] = useState(todayInput());
  const [note, setNote] = useState("");
  const [errors, setErrors] = useState<Errors>({});
  const [isPending, startTransition] = useTransition();
  const clear = (k: string) => setErrors((e) => (e[k] ? { ...e, [k]: undefined } : e));

  const n = Number(amount);
  const valid = amount.trim() !== "" && amount !== "-" && Number.isFinite(n);
  const after = !valid ? null : mode === "SET" ? n : roundMoney(wallet.balance + (mode === "CREDIT" ? n : -n));
  const change = after === null ? null : roundMoney(after - wallet.balance);

  const submit = () =>
    startTransition(async () => {
      const result = await createAdjustment({ walletId: wallet.id, mode, amount, date, note });
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
        <div role="radiogroup" aria-label="How to adjust" className="grid grid-cols-3 gap-1 rounded-lg bg-muted p-1">
          {MODES.map((m) => (
            <button
              key={m.value}
              type="button"
              role="radio"
              aria-checked={mode === m.value}
              onClick={() => {
                setMode(m.value);
                clear("amount");
              }}
              className={cn(
                "rounded-md px-2 py-1.5 text-xs font-medium transition-colors sm:text-sm",
                mode === m.value ? "bg-background text-foreground shadow-sm" : "text-muted-foreground hover:text-foreground",
              )}
            >
              {m.label}
            </button>
          ))}
        </div>

        <Field data-invalid={Boolean(errors.amount)}>
          <FieldLabel htmlFor="adjust-amount">{mode === "SET" ? "What the balance really is now" : "Amount"}</FieldLabel>
          <div className="relative">
            <span className="pointer-events-none absolute inset-y-0 left-3 flex items-center text-sm text-muted-foreground">Rs.</span>
            <Input
              id="adjust-amount"
              inputMode="decimal"
              placeholder="0.00"
              value={amount}
              onChange={(e) => {
                const raw = e.target.value.replace(mode === "SET" ? /[^\d.-]/g : /[^\d.]/g, "");
                setAmount((raw.startsWith("-") ? "-" + raw.slice(1).replace(/-/g, "") : raw.replace(/-/g, "")).slice(0, 13));
                clear("amount");
              }}
              className="pl-11 tabular-nums"
              aria-invalid={Boolean(errors.amount)}
              autoFocus
            />
          </div>
          {errors.amount ? (
            <FieldError>{errors.amount}</FieldError>
          ) : (
            <FieldDescription>
              Shows now: {formatCurrency(wallet.balance)}
              {after !== null && change !== null && change !== 0 && (
                <>
                  {" "}
                  → <span className="font-medium text-foreground">{formatCurrency(after)}</span> ({change > 0 ? "+" : "−"}
                  {formatCurrency(Math.abs(change))})
                </>
              )}
            </FieldDescription>
          )}
        </Field>

        <div className="grid gap-4 sm:grid-cols-2">
          <Field data-invalid={Boolean(errors.date)}>
            <FieldLabel htmlFor="adjust-date">Date</FieldLabel>
            <Input
              id="adjust-date"
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
          <Field>
            <FieldLabel htmlFor="adjust-note">
              Note <span className="font-normal text-muted-foreground">(optional)</span>
            </FieldLabel>
            <Input id="adjust-note" maxLength={200} placeholder="e.g. Counted cash" value={note} onChange={(e) => setNote(e.target.value)} />
          </Field>
        </div>
      </FieldGroup>
      <DialogFooter>
        <Button type="button" variant="ghost" onClick={onDone} disabled={isPending}>
          Cancel
        </Button>
        <Button type="submit" disabled={isPending}>
          {isPending && <Loader2 className="animate-spin" />}
          Save adjustment
        </Button>
      </DialogFooter>
    </form>
  );
}

export function AdjustDialog({ wallet, open, onOpenChange }: { wallet: WalletDTO; open: boolean; onOpenChange: (open: boolean) => void }) {
  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-h-[92dvh] overflow-y-auto sm:max-w-md">
        <DialogHeader>
          <DialogTitle>Adjust {wallet.name}</DialogTitle>
          <DialogDescription>
            Fix the balance, like after counting your cash. It shows in the wallet&apos;s history but isn&apos;t counted as income or
            spending.
          </DialogDescription>
        </DialogHeader>
        {open && <AdjustForm wallet={wallet} onDone={() => onOpenChange(false)} />}
      </DialogContent>
    </Dialog>
  );
}
