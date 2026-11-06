"use client";

import { Loader2 } from "lucide-react";
import { useState, useTransition } from "react";
import { toast } from "sonner";
import { Button } from "@/components/ui/button";
import { Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { Field, FieldError, FieldGroup, FieldLabel } from "@/components/ui/field";
import { Input } from "@/components/ui/input";
import { WalletSelect } from "@/components/wallets/wallet-select";
import { todayInput } from "@/lib/dates";
import { formatCurrency } from "@/lib/format";
import { recordPayment } from "@/server/actions/dues";
import type { DueDTO } from "@/types";

/** Records a full or partial repayment of one due. */
export function PaymentDialog({
  due,
  friendName,
  open,
  onOpenChange,
}: {
  due: DueDTO;
  friendName: string;
  open: boolean;
  onOpenChange: (open: boolean) => void;
}) {
  const [amount, setAmount] = useState(String(due.remaining));
  const [date, setDate] = useState(todayInput());
  const [note, setNote] = useState("");
  const [walletId, setWalletId] = useState("");
  const [errors, setErrors] = useState<Record<string, string | undefined>>({});
  const [isPending, startTransition] = useTransition();
  const owedToMe = due.direction === "OWED_TO_ME";

  const submit = () => {
    setErrors({});
    startTransition(async () => {
      const result = await recordPayment(due.id, { amount, date, note, walletId });
      if (!result.ok) {
        setErrors(Object.fromEntries(Object.entries(result.fieldErrors ?? {}).map(([k, v]) => [k, v?.[0]])));
        toast.error(result.error);
        return;
      }
      toast.success(result.message);
      onOpenChange(false);
    });
  };

  return (
    <Dialog open={open} onOpenChange={(o) => !isPending && onOpenChange(o)}>
      <DialogContent className="sm:max-w-md">
        <DialogHeader>
          <DialogTitle>{owedToMe ? `${friendName} paid you back` : `You paid ${friendName}`}</DialogTitle>
          <DialogDescription>
            {`For "${due.description}". `}
            {formatCurrency(due.remaining)} is still pending. Record a full or partial payment.
          </DialogDescription>
        </DialogHeader>
        <form
          noValidate
          onSubmit={(e) => {
            e.preventDefault();
            submit();
          }}
          className="flex flex-col gap-5"
        >
          <FieldGroup className="gap-4">
            <Field data-invalid={Boolean(errors.amount)}>
              <FieldLabel htmlFor="payment-amount">Amount received</FieldLabel>
              <div className="relative">
                <span className="pointer-events-none absolute inset-y-0 left-3 flex items-center text-sm text-muted-foreground">
                  Rs.
                </span>
                <Input
                  id="payment-amount"
                  inputMode="decimal"
                  value={amount}
                  onChange={(e) => setAmount(e.target.value.replace(/[^\d.]/g, "").slice(0, 12))}
                  className="pl-11 tabular-nums"
                  aria-invalid={Boolean(errors.amount)}
                  autoFocus
                />
              </div>
              <div className="flex gap-2">
                <Button type="button" size="xs" variant="secondary" onClick={() => setAmount(String(due.remaining))}>
                  Full {formatCurrency(due.remaining)}
                </Button>
                <Button
                  type="button"
                  size="xs"
                  variant="ghost"
                  onClick={() => setAmount(String(Math.round(due.remaining * 50) / 100))}
                >
                  Half
                </Button>
              </div>
              {errors.amount && <FieldError>{errors.amount}</FieldError>}
            </Field>
            <Field data-invalid={Boolean(errors.date)}>
              <FieldLabel htmlFor="payment-date">Date</FieldLabel>
              <Input
                id="payment-date"
                type="date"
                value={date}
                max={todayInput()}
                onChange={(e) => setDate(e.target.value)}
                aria-invalid={Boolean(errors.date)}
              />
              {errors.date && <FieldError>{errors.date}</FieldError>}
            </Field>
            <Field data-invalid={Boolean(errors.walletId)}>
              <FieldLabel htmlFor="payment-wallet">
                {owedToMe ? "Received in" : "Paid from"}{" "}
                <span className="font-normal text-muted-foreground">(optional)</span>
              </FieldLabel>
              <WalletSelect id="payment-wallet" value={walletId} onChange={setWalletId} invalid={Boolean(errors.walletId)} />
              {errors.walletId && <FieldError>{errors.walletId}</FieldError>}
            </Field>
            <Field>
              <FieldLabel htmlFor="payment-note">
                Note <span className="font-normal text-muted-foreground">(optional)</span>
              </FieldLabel>
              <Input
                id="payment-note"
                value={note}
                maxLength={200}
                placeholder="e.g. JazzCash transfer"
                onChange={(e) => setNote(e.target.value)}
              />
            </Field>
          </FieldGroup>
          <DialogFooter>
            <Button type="button" variant="ghost" onClick={() => onOpenChange(false)} disabled={isPending}>
              Cancel
            </Button>
            <Button type="submit" disabled={isPending}>
              {isPending && <Loader2 className="animate-spin" />}
              Record payment
            </Button>
          </DialogFooter>
        </form>
      </DialogContent>
    </Dialog>
  );
}
