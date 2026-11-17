"use client";

import { Loader2, Sparkles } from "lucide-react";
import { useState, useTransition } from "react";
import { toast } from "sonner";
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
import { Switch } from "@/components/ui/switch";
import { WalletSelect } from "@/components/wallets/wallet-select";
import { todayInput } from "@/lib/dates";
import { formatCurrency } from "@/lib/format";
import {
  ASSET_META,
  ASSET_TYPES,
  type AssetTypeValue,
  formatUnits,
  METAL_SYMBOL,
  perUnit,
  type TxnTypeValue,
  unitsLabel,
  type UnitValue,
} from "@/lib/portfolio";
import { cn } from "@/lib/utils";
import { addTxn, createInvestment, setPrice, updateInvestment, updateTxn } from "@/server/actions/portfolio";
import type { HoldingDTO, TxnDTO } from "@/server/queries/portfolio";
import type { ActionResult } from "@/types";

type Errors = Record<string, string | undefined>;

function useSubmit() {
  const [errors, setErrors] = useState<Errors>({});
  const [isPending, startTransition] = useTransition();
  const clear = (...keys: string[]) =>
    setErrors((e) => (keys.some((k) => e[k]) ? { ...e, ...Object.fromEntries(keys.map((k) => [k, undefined])) } : e));
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

/** Digits and one dot, limited to `decimals` places. */
function decimal(raw: string, decimals: number) {
  let v = raw.replace(/,/g, "").replace(/[^\d.]/g, "");
  const dot = v.indexOf(".");
  if (dot !== -1) v = v.slice(0, dot + 1) + v.slice(dot + 1).replace(/\./g, "").slice(0, decimals);
  return v.slice(0, 16);
}

const trim = (n: number, places: number) => String(Math.round(n * 10 ** places) / 10 ** places);

type TxnState = { units: string; price: string; total: string; fees: string; date: string; walletId: string; note: string };

const emptyTxn = (price?: number | null): TxnState => ({
  units: "",
  price: price ? String(price) : "",
  total: "",
  fees: "",
  date: todayInput(),
  walletId: "",
  note: "",
});

/** Units x price fills in the total; typing the total works out the price. */
function TxnFields({
  type,
  unit,
  state,
  set,
  errors,
  clear,
  heldUnits,
}: {
  type: TxnTypeValue;
  unit: string;
  state: TxnState;
  set: (patch: Partial<TxnState>) => void;
  errors: Errors;
  clear: (...keys: string[]) => void;
  heldUnits?: number;
}) {
  const product = (units: string, price: string) => {
    const t = Number(units) * Number(price);
    return t > 0 ? trim(t, 2) : "";
  };
  const gross = Number(state.total) || 0;
  const fees = Number(state.fees) || 0;
  const net = type === "BUY" ? gross + fees : gross - fees;
  const noun = unit === "units" ? "units" : unit === "share" ? "shares" : unit === "gram" ? "grams" : "tola";

  return (
    <>
      {type !== "DIVIDEND" && (
        <div className="grid gap-4 sm:grid-cols-2">
          <Field data-invalid={Boolean(errors.units)}>
            <FieldLabel htmlFor="txn-units">How many {noun}</FieldLabel>
            <Input
              id="txn-units"
              inputMode="decimal"
              placeholder="0"
              value={state.units}
              onChange={(e) => {
                const units = decimal(e.target.value, 6);
                set({ units, total: product(units, state.price) });
                clear("units");
              }}
              className="tabular-nums"
              aria-invalid={Boolean(errors.units)}
              autoFocus
            />
            {type === "SELL" && heldUnits !== undefined && heldUnits > 0 && (
              <button
                type="button"
                className="w-fit text-xs font-medium text-primary hover:underline"
                onClick={() => {
                  set({ units: String(heldUnits), total: product(String(heldUnits), state.price) });
                  clear("units");
                }}
              >
                Sell all {unitsLabel(heldUnits, unit)}
              </button>
            )}
            {errors.units && <FieldError>{errors.units}</FieldError>}
          </Field>
          <Field>
            <FieldLabel htmlFor="txn-price">Price {perUnit(unit)}</FieldLabel>
            <div className="relative">
              <span className="pointer-events-none absolute inset-y-0 left-3 flex items-center text-sm text-muted-foreground">
                Rs.
              </span>
              <Input
                id="txn-price"
                inputMode="decimal"
                placeholder="0.00"
                value={state.price}
                onChange={(e) => {
                  const price = decimal(e.target.value, 4);
                  set({ price, total: product(state.units, price) });
                }}
                className="pl-11 tabular-nums"
              />
            </div>
          </Field>
        </div>
      )}
      <div className="grid gap-4 sm:grid-cols-2">
        <Field data-invalid={Boolean(errors.amount)}>
          <FieldLabel htmlFor="txn-total">{type === "DIVIDEND" ? "Amount received" : "Total amount"}</FieldLabel>
          <div className="relative">
            <span className="pointer-events-none absolute inset-y-0 left-3 flex items-center text-sm text-muted-foreground">
              Rs.
            </span>
            <Input
              id="txn-total"
              inputMode="decimal"
              placeholder="0.00"
              value={state.total}
              onChange={(e) => {
                const total = decimal(e.target.value, 2);
                const units = Number(state.units);
                set({ total, ...(units > 0 && Number(total) > 0 ? { price: trim(Number(total) / units, 4) } : {}) });
                clear("amount");
              }}
              className="pl-11 tabular-nums"
              aria-invalid={Boolean(errors.amount)}
              autoFocus={type === "DIVIDEND"}
            />
          </div>
          {errors.amount && <FieldError>{errors.amount}</FieldError>}
        </Field>
        {type !== "DIVIDEND" && (
          <Field data-invalid={Boolean(errors.fees)}>
            <FieldLabel htmlFor="txn-fees">
              Fees <span className="font-normal text-muted-foreground">(optional)</span>
            </FieldLabel>
            <Input
              id="txn-fees"
              inputMode="decimal"
              placeholder="0"
              value={state.fees}
              onChange={(e) => {
                set({ fees: decimal(e.target.value, 2) });
                clear("fees");
              }}
              className="tabular-nums"
              aria-invalid={Boolean(errors.fees)}
            />
            {errors.fees && <FieldError>{errors.fees}</FieldError>}
          </Field>
        )}
      </div>
      <div className="grid gap-4 sm:grid-cols-2">
        <Field data-invalid={Boolean(errors.date)}>
          <FieldLabel htmlFor="txn-date">Date</FieldLabel>
          <Input
            id="txn-date"
            type="date"
            max={todayInput()}
            value={state.date}
            onChange={(e) => {
              set({ date: e.target.value });
              clear("date");
            }}
            aria-invalid={Boolean(errors.date)}
          />
          {errors.date && <FieldError>{errors.date}</FieldError>}
        </Field>
        <Field data-invalid={Boolean(errors.walletId)}>
          <FieldLabel htmlFor="txn-wallet">
            {type === "BUY" ? "Paid from" : "Received in"}{" "}
            <span className="font-normal text-muted-foreground">(optional)</span>
          </FieldLabel>
          <WalletSelect
            id="txn-wallet"
            value={state.walletId}
            onChange={(walletId) => {
              set({ walletId });
              clear("walletId");
            }}
            invalid={Boolean(errors.walletId)}
          />
          {errors.walletId && <FieldError>{errors.walletId}</FieldError>}
        </Field>
      </div>
      {type === "BUY" && !state.walletId && (
        <FieldDescription>Leave the wallet empty for older purchases, so today&apos;s balance isn&apos;t reduced.</FieldDescription>
      )}
      {fees > 0 && gross > 0 && (
        <p className="rounded-md bg-muted/60 px-3 py-2 text-sm text-muted-foreground">
          {type === "BUY" ? "You pay " : "You receive "}
          <span className="font-semibold text-foreground">{formatCurrency(net)}</span> including fees.
        </p>
      )}
    </>
  );
}

const txnValues = (type: TxnTypeValue, s: TxnState) => ({
  type,
  date: s.date,
  units: type === "DIVIDEND" ? "" : s.units,
  amount: s.total,
  fees: type === "DIVIDEND" ? "" : s.fees,
  walletId: s.walletId,
  note: s.note,
});

/* ------------------------------------------------------------------ */
/* Add / edit an investment                                            */
/* ------------------------------------------------------------------ */

function CreateForm({ onDone }: { onDone: () => void }) {
  const [type, setType] = useState<AssetTypeValue>("MUTUAL_FUND");
  const [name, setName] = useState("");
  const [unit, setUnit] = useState<UnitValue>("units");
  const [autoPrice, setAutoPrice] = useState(true);
  const [premium, setPremium] = useState("0");
  const [withFirst, setWithFirst] = useState(true);
  const [txn, setTxn] = useState<TxnState>(emptyTxn());
  const { errors, clear, isPending, submit } = useSubmit();
  const isMetal = METAL_SYMBOL[type] !== undefined;

  const pickType = (t: AssetTypeValue) => {
    // Keep a name the user typed, but follow the type's own default name.
    if (!name || name === ASSET_META[type].label) setName(METAL_SYMBOL[t] ? ASSET_META[t].label : "");
    setType(t);
    setUnit(ASSET_META[t].units[0]);
    clear("name");
  };

  return (
    <form
      noValidate
      className="flex flex-col gap-5"
      onSubmit={(e) => {
        e.preventDefault();
        submit(
          () =>
            createInvestment(
              { type, name, unit, autoPrice: isMetal && autoPrice, premiumPct: premium.trim() || "0", notes: "" },
              withFirst ? txnValues("BUY", txn) : undefined,
            ),
          onDone,
        );
      }}
    >
      <FieldGroup className="gap-4">
        <Field>
          <FieldLabel id="inv-type-label">Type</FieldLabel>
          <div role="radiogroup" aria-labelledby="inv-type-label" className="flex flex-wrap gap-2">
            {ASSET_TYPES.map((t) => (
              <button
                key={t}
                type="button"
                role="radio"
                aria-checked={type === t}
                onClick={() => pickType(t)}
                className={cn(
                  "rounded-full border px-3 py-1 text-xs font-medium transition-colors",
                  type === t ? "border-primary bg-primary/10 text-foreground" : "text-muted-foreground hover:bg-muted/60",
                )}
              >
                {ASSET_META[t].label}
              </button>
            ))}
          </div>
        </Field>

        <Field data-invalid={Boolean(errors.name)}>
          <FieldLabel htmlFor="inv-name">Name</FieldLabel>
          <Input
            id="inv-name"
            value={name}
            maxLength={60}
            placeholder={type === "MUTUAL_FUND" ? "e.g. Meezan Islamic Fund" : "e.g. Silver"}
            onChange={(e) => {
              setName(e.target.value);
              clear("name");
            }}
            aria-invalid={Boolean(errors.name)}
          />
          {errors.name && <FieldError>{errors.name}</FieldError>}
        </Field>

        {isMetal && (
          <>
            <Field>
              <FieldLabel id="inv-unit-label">Measured in</FieldLabel>
              <div className="inline-flex w-fit rounded-lg bg-muted p-0.5" role="radiogroup" aria-labelledby="inv-unit-label">
                {ASSET_META[type].units.map((u) => (
                  <button
                    key={u}
                    type="button"
                    role="radio"
                    aria-checked={unit === u}
                    onClick={() => setUnit(u)}
                    className={cn(
                      "rounded-md px-3 py-1.5 text-xs font-medium capitalize transition-colors",
                      unit === u ? "bg-background text-foreground shadow-xs" : "text-muted-foreground hover:text-foreground",
                    )}
                  >
                    {u}
                  </button>
                ))}
              </div>
            </Field>
            <AutoPriceFields
              autoPrice={autoPrice}
              setAutoPrice={setAutoPrice}
              premium={premium}
              setPremium={setPremium}
              error={errors.premiumPct}
            />
          </>
        )}

        <div className="flex items-center justify-between gap-4 rounded-lg border border-dashed px-4 py-3">
          <label htmlFor="inv-first" className="text-sm font-medium">
            Add my purchase now
          </label>
          <Switch id="inv-first" checked={withFirst} onCheckedChange={setWithFirst} />
        </div>
        {withFirst && (
          <TxnFields
            type="BUY"
            unit={unit}
            state={txn}
            set={(patch) => setTxn((s) => ({ ...s, ...patch }))}
            errors={errors}
            clear={clear}
          />
        )}
      </FieldGroup>
      <DialogFooter>
        <Button type="button" variant="ghost" onClick={onDone} disabled={isPending}>
          Cancel
        </Button>
        <Button type="submit" disabled={isPending}>
          {isPending && <Loader2 className="animate-spin" />}
          Add investment
        </Button>
      </DialogFooter>
    </form>
  );
}

function AutoPriceFields({
  autoPrice,
  setAutoPrice,
  premium,
  setPremium,
  error,
}: {
  autoPrice: boolean;
  setAutoPrice: (v: boolean) => void;
  premium: string;
  setPremium: (v: string) => void;
  error?: string;
}) {
  return (
    <div className="flex flex-col gap-3 rounded-lg border px-4 py-3">
      <div className="flex items-center justify-between gap-4">
        <div>
          <label htmlFor="inv-auto" className="text-sm font-medium">
            Update the price automatically
          </label>
          <p className="text-xs text-muted-foreground">Uses the international rate in rupees, refreshed every few hours.</p>
        </div>
        <Switch id="inv-auto" checked={autoPrice} onCheckedChange={setAutoPrice} />
      </div>
      {autoPrice && (
        <Field data-invalid={Boolean(error)}>
          <FieldLabel htmlFor="inv-premium">Local premium %</FieldLabel>
          <Input
            id="inv-premium"
            inputMode="decimal"
            className="w-28 tabular-nums"
            value={premium}
            onChange={(e) => setPremium(e.target.value.replace(/[^\d.-]/g, "").slice(0, 7))}
            aria-invalid={Boolean(error)}
          />
          {error ? (
            <FieldError>{error}</FieldError>
          ) : (
            <FieldDescription>The sarafa rate is often higher than the international rate. Add the difference here.</FieldDescription>
          )}
        </Field>
      )}
    </div>
  );
}

function EditForm({ holding, onDone }: { holding: HoldingDTO; onDone: () => void }) {
  const [name, setName] = useState(holding.name);
  const [autoPrice, setAutoPrice] = useState(holding.autoPrice);
  const [premium, setPremium] = useState(String(holding.premiumPct));
  const [notes, setNotes] = useState(holding.notes ?? "");
  const { errors, clear, isPending, submit } = useSubmit();
  const isMetal = METAL_SYMBOL[holding.type] !== undefined;
  return (
    <form
      noValidate
      className="flex flex-col gap-5"
      onSubmit={(e) => {
        e.preventDefault();
        submit(() => updateInvestment(holding.id, { name, autoPrice, premiumPct: premium.trim() || "0", notes }), onDone);
      }}
    >
      <FieldGroup className="gap-4">
        <Field data-invalid={Boolean(errors.name)}>
          <FieldLabel htmlFor="inv-name">Name</FieldLabel>
          <Input
            id="inv-name"
            value={name}
            maxLength={60}
            onChange={(e) => {
              setName(e.target.value);
              clear("name");
            }}
            aria-invalid={Boolean(errors.name)}
            autoFocus
          />
          {errors.name && <FieldError>{errors.name}</FieldError>}
        </Field>
        {isMetal && (
          <AutoPriceFields
            autoPrice={autoPrice}
            setAutoPrice={setAutoPrice}
            premium={premium}
            setPremium={setPremium}
            error={errors.premiumPct}
          />
        )}
        <Field>
          <FieldLabel htmlFor="inv-notes">
            Notes <span className="font-normal text-muted-foreground">(optional)</span>
          </FieldLabel>
          <Input id="inv-notes" maxLength={500} value={notes} onChange={(e) => setNotes(e.target.value)} />
        </Field>
      </FieldGroup>
      <DialogFooter>
        <Button type="button" variant="ghost" onClick={onDone} disabled={isPending}>
          Cancel
        </Button>
        <Button type="submit" disabled={isPending}>
          {isPending && <Loader2 className="animate-spin" />}
          Save changes
        </Button>
      </DialogFooter>
    </form>
  );
}

export function InvestmentDialog({
  open,
  onOpenChange,
  holding,
}: {
  open: boolean;
  onOpenChange: (o: boolean) => void;
  holding?: HoldingDTO;
}) {
  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-h-[92dvh] overflow-y-auto sm:max-w-lg">
        <DialogHeader>
          <DialogTitle>{holding ? `Edit ${holding.name}` : "Add an investment"}</DialogTitle>
          <DialogDescription>
            {holding ? "Change the name and price settings." : "A mutual fund, silver, gold, stocks or anything else you hold."}
          </DialogDescription>
        </DialogHeader>
        {open && (holding ? <EditForm holding={holding} onDone={() => onOpenChange(false)} /> : <CreateForm onDone={() => onOpenChange(false)} />)}
      </DialogContent>
    </Dialog>
  );
}

/* ------------------------------------------------------------------ */
/* Buy / sell / dividend                                               */
/* ------------------------------------------------------------------ */

function TxnForm({
  holding,
  type,
  txn,
  onDone,
}: {
  holding: HoldingDTO;
  type: TxnTypeValue;
  txn?: TxnDTO;
  onDone: () => void;
}) {
  const initial = (): TxnState => {
    if (!txn) return emptyTxn(type === "DIVIDEND" ? null : holding.currentPrice);
    const gross = type === "BUY" ? txn.amount - txn.fees : txn.amount + txn.fees;
    return {
      units: type === "DIVIDEND" ? "" : String(txn.units),
      price: type === "DIVIDEND" ? "" : trim(txn.price, 4),
      total: trim(gross, 2),
      fees: txn.fees ? String(txn.fees) : "",
      date: txn.date,
      walletId: txn.wallet?.id ?? "",
      note: txn.note ?? "",
    };
  };
  const [state, setState] = useState<TxnState>(initial);
  const { errors, clear, isPending, submit } = useSubmit();

  return (
    <form
      noValidate
      className="flex flex-col gap-5"
      onSubmit={(e) => {
        e.preventDefault();
        const values = txnValues(type, state);
        submit(() => (txn ? updateTxn(txn.id, values) : addTxn(holding.id, values)), onDone);
      }}
    >
      <FieldGroup className="gap-4">
        <TxnFields
          type={type}
          unit={holding.unit}
          state={state}
          set={(patch) => setState((s) => ({ ...s, ...patch }))}
          errors={errors}
          clear={clear}
          heldUnits={txn ? undefined : holding.units}
        />
        <Field>
          <FieldLabel htmlFor="txn-note">
            Note <span className="font-normal text-muted-foreground">(optional)</span>
          </FieldLabel>
          <Input
            id="txn-note"
            maxLength={200}
            value={state.note}
            onChange={(e) => setState((s) => ({ ...s, note: e.target.value }))}
          />
        </Field>
      </FieldGroup>
      <DialogFooter>
        <Button type="button" variant="ghost" onClick={onDone} disabled={isPending}>
          Cancel
        </Button>
        <Button type="submit" disabled={isPending}>
          {isPending && <Loader2 className="animate-spin" />}
          {txn ? "Save changes" : "Save"}
        </Button>
      </DialogFooter>
    </form>
  );
}

const TXN_TITLES: Record<TxnTypeValue, string> = { BUY: "Buy", SELL: "Sell", DIVIDEND: "Dividend from" };

export function TxnDialog({
  open,
  onOpenChange,
  holding,
  type,
  txn,
}: {
  open: boolean;
  onOpenChange: (o: boolean) => void;
  holding: HoldingDTO;
  type: TxnTypeValue;
  txn?: TxnDTO;
}) {
  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-h-[92dvh] overflow-y-auto sm:max-w-lg">
        <DialogHeader>
          <DialogTitle>{txn ? "Edit transaction" : `${TXN_TITLES[type]} ${holding.name}`}</DialogTitle>
          <DialogDescription>
            {type === "SELL" && holding.units > 0
              ? `You hold ${unitsLabel(holding.units, holding.unit)}.`
              : "This isn't counted as an expense or income."}
          </DialogDescription>
        </DialogHeader>
        {open && <TxnForm holding={holding} type={type} txn={txn} onDone={() => onOpenChange(false)} />}
      </DialogContent>
    </Dialog>
  );
}

/* ------------------------------------------------------------------ */
/* Update price                                                        */
/* ------------------------------------------------------------------ */

function PriceForm({ holding, onDone }: { holding: HoldingDTO; onDone: () => void }) {
  const [date, setDate] = useState(todayInput());
  const [price, setPriceValue] = useState("");
  const { errors, clear, isPending, submit } = useSubmit();
  const nav = holding.type === "MUTUAL_FUND";
  return (
    <form
      noValidate
      className="flex flex-col gap-5"
      onSubmit={(e) => {
        e.preventDefault();
        submit(() => setPrice(holding.id, { date, price }), onDone);
      }}
    >
      <FieldGroup className="gap-4">
        <div className="grid gap-4 sm:grid-cols-2">
          <Field data-invalid={Boolean(errors.price)}>
            <FieldLabel htmlFor="price-value">
              {nav ? "NAV" : "Price"} {perUnit(holding.unit)}
            </FieldLabel>
            <div className="relative">
              <span className="pointer-events-none absolute inset-y-0 left-3 flex items-center text-sm text-muted-foreground">
                Rs.
              </span>
              <Input
                id="price-value"
                inputMode="decimal"
                placeholder="0.00"
                value={price}
                onChange={(e) => {
                  setPriceValue(decimal(e.target.value, 4));
                  clear("price");
                }}
                className="pl-11 tabular-nums"
                aria-invalid={Boolean(errors.price)}
                autoFocus
              />
            </div>
            {errors.price && <FieldError>{errors.price}</FieldError>}
          </Field>
          <Field data-invalid={Boolean(errors.date)}>
            <FieldLabel htmlFor="price-date">Date</FieldLabel>
            <Input
              id="price-date"
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
        </div>
        {holding.marketPrice !== null && (
          <button
            type="button"
            onClick={() => {
              setPriceValue(String(holding.marketPrice));
              clear("price");
            }}
            className="inline-flex w-fit items-center gap-1.5 rounded text-xs font-medium text-primary hover:underline"
          >
            <Sparkles className="size-3.5" />
            Use today&apos;s rate: Rs. {formatUnits(holding.marketPrice)} {perUnit(holding.unit)}
          </button>
        )}
        {holding.autoPrice && (
          <FieldDescription>A price you enter for today replaces the automatic rate until tomorrow.</FieldDescription>
        )}
      </FieldGroup>
      <DialogFooter>
        <Button type="button" variant="ghost" onClick={onDone} disabled={isPending}>
          Cancel
        </Button>
        <Button type="submit" disabled={isPending}>
          {isPending && <Loader2 className="animate-spin" />}
          Save price
        </Button>
      </DialogFooter>
    </form>
  );
}

export function PriceDialog({
  open,
  onOpenChange,
  holding,
}: {
  open: boolean;
  onOpenChange: (o: boolean) => void;
  holding: HoldingDTO;
}) {
  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="sm:max-w-md">
        <DialogHeader>
          <DialogTitle>Update price of {holding.name}</DialogTitle>
          <DialogDescription>
            {holding.type === "MUTUAL_FUND" ? "Enter the latest NAV from your fund's website or statement." : "Enter today's rate."}
          </DialogDescription>
        </DialogHeader>
        {open && <PriceForm holding={holding} onDone={() => onOpenChange(false)} />}
      </DialogContent>
    </Dialog>
  );
}
