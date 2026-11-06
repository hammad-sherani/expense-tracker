"use client";

import { Loader2 } from "lucide-react";
import { useState, useTransition } from "react";
import { toast } from "sonner";
import { ColorPicker } from "@/components/shared/color-picker";
import { Button } from "@/components/ui/button";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { Field, FieldDescription, FieldError, FieldGroup, FieldLabel } from "@/components/ui/field";
import { Input } from "@/components/ui/input";
import { cn } from "@/lib/utils";
import { WALLET_TYPE_META, WALLET_TYPES, type WalletTypeValue } from "@/lib/wallets";
import { createWallet, updateWallet } from "@/server/actions/wallets";
import type { WalletDTO } from "@/types";

type Errors = Record<string, string | undefined>;

function WalletForm({ wallet, onDone }: { wallet?: WalletDTO; onDone: () => void }) {
  const [name, setName] = useState(wallet?.name ?? "");
  const [type, setType] = useState<WalletTypeValue>(wallet?.type ?? "BANK");
  const [color, setColor] = useState(wallet?.color ?? WALLET_TYPE_META.BANK.color);
  const [opening, setOpening] = useState(wallet ? String(wallet.openingBalance) : "0");
  const [errors, setErrors] = useState<Errors>({});
  const [isPending, startTransition] = useTransition();
  const clear = (k: string) => setErrors((e) => (e[k] ? { ...e, [k]: undefined } : e));

  const submit = () =>
    startTransition(async () => {
      const values = { name, type, color, openingBalance: opening.trim() || "0" };
      const result = wallet ? await updateWallet(wallet.id, values) : await createWallet(values);
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
        <Field data-invalid={Boolean(errors.name)}>
          <FieldLabel htmlFor="wallet-name">Name</FieldLabel>
          <Input
            id="wallet-name"
            value={name}
            maxLength={30}
            placeholder="e.g. Meezan Bank, JazzCash"
            onChange={(e) => {
              setName(e.target.value);
              clear("name");
            }}
            aria-invalid={Boolean(errors.name)}
            autoFocus
          />
          {errors.name && <FieldError>{errors.name}</FieldError>}
        </Field>

        <Field>
          <FieldLabel id="wallet-type-label">Type</FieldLabel>
          <div role="radiogroup" aria-labelledby="wallet-type-label" className="grid grid-cols-3 gap-2 sm:grid-cols-5">
            {WALLET_TYPES.map((t) => {
              const meta = WALLET_TYPE_META[t];
              const Icon = meta.icon;
              const selected = type === t;
              return (
                <button
                  key={t}
                  type="button"
                  role="radio"
                  aria-checked={selected}
                  onClick={() => {
                    // Follow the type's colour unless the user picked their own.
                    if (color === WALLET_TYPE_META[type].color) setColor(meta.color);
                    setType(t);
                  }}
                  className={cn(
                    "flex flex-col items-center gap-1 rounded-lg border px-2 py-2 text-xs transition-colors hover:bg-muted/60",
                    selected ? "border-primary bg-primary/5 font-medium text-foreground" : "text-muted-foreground",
                  )}
                >
                  <Icon className="size-4" />
                  {meta.label.replace(" account", "").replace(" wallet", "")}
                </button>
              );
            })}
          </div>
        </Field>

        <Field>
          <FieldLabel>Colour</FieldLabel>
          <ColorPicker value={color} onChange={setColor} label="Wallet colour" />
        </Field>

        <Field data-invalid={Boolean(errors.openingBalance)}>
          <FieldLabel htmlFor="wallet-opening">Starting balance</FieldLabel>
          <div className="relative">
            <span className="pointer-events-none absolute inset-y-0 left-3 flex items-center text-sm text-muted-foreground">
              Rs.
            </span>
            <Input
              id="wallet-opening"
              inputMode="decimal"
              value={opening}
              onChange={(e) => {
                setOpening(e.target.value.replace(/[^\d.-]/g, "").slice(0, 13));
                clear("openingBalance");
              }}
              className="pl-11 tabular-nums"
              aria-invalid={Boolean(errors.openingBalance)}
            />
          </div>
          {errors.openingBalance ? (
            <FieldError>{errors.openingBalance}</FieldError>
          ) : (
            <FieldDescription>
              What was in it before you started tracking here. Income, expenses and transfers are added on top.
            </FieldDescription>
          )}
        </Field>
      </FieldGroup>
      <DialogFooter>
        <Button type="button" variant="ghost" onClick={onDone} disabled={isPending}>
          Cancel
        </Button>
        <Button type="submit" disabled={isPending}>
          {isPending && <Loader2 className="animate-spin" />}
          {wallet ? "Save changes" : "Add wallet"}
        </Button>
      </DialogFooter>
    </form>
  );
}

export function WalletDialog({
  open,
  onOpenChange,
  wallet,
}: {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  wallet?: WalletDTO;
}) {
  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-h-[92dvh] overflow-y-auto sm:max-w-md">
        <DialogHeader>
          <DialogTitle>{wallet ? `Edit ${wallet.name}` : "Add a wallet"}</DialogTitle>
          <DialogDescription>Cash, a bank account, JazzCash/Easypaisa or a card.</DialogDescription>
        </DialogHeader>
        {open && <WalletForm wallet={wallet} onDone={() => onOpenChange(false)} />}
      </DialogContent>
    </Dialog>
  );
}
