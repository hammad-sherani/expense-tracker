"use client";

import { useLookups } from "@/components/layout/lookups";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { formatCurrency } from "@/lib/format";
import { WALLET_TYPE_META } from "@/lib/wallets";

const NONE = "__none__";

/** Picks one of the user's active wallets. "" = not tracked. */
export function WalletSelect({
  id,
  value,
  onChange,
  allowNone = true,
  noneLabel = "Not tracked",
  showBalance = false,
  exclude,
  invalid,
}: {
  id?: string;
  value: string;
  onChange: (walletId: string) => void;
  allowNone?: boolean;
  noneLabel?: string;
  showBalance?: boolean;
  exclude?: string;
  invalid?: boolean;
}) {
  const { wallets } = useLookups();
  const options = wallets.filter((w) => (!w.archived || w.id === value) && w.id !== exclude);
  const selected = options.find((w) => w.id === value);

  return (
    <Select value={value || NONE} onValueChange={(v) => onChange(v === NONE ? "" : v)}>
      <SelectTrigger id={id} className="w-full" aria-invalid={invalid}>
        <SelectValue placeholder={noneLabel}>{selected?.name ?? (allowNone ? noneLabel : "Choose a wallet")}</SelectValue>
      </SelectTrigger>
      <SelectContent>
        {allowNone && <SelectItem value={NONE}>{noneLabel}</SelectItem>}
        {options.map((w) => {
          const Icon = WALLET_TYPE_META[w.type].icon;
          return (
            <SelectItem key={w.id} value={w.id}>
              <Icon style={{ color: w.color }} />
              <span>{w.name}</span>
              {showBalance && (
                <span className="ml-auto pl-3 text-xs text-muted-foreground tabular-nums">{formatCurrency(w.balance)}</span>
              )}
            </SelectItem>
          );
        })}
      </SelectContent>
    </Select>
  );
}
