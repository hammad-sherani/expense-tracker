"use client";

import { Archive, ArchiveRestore, ChevronDown, HandCoins, Loader2, MoreVertical, Pencil, Plus, Trash2, Undo2, UserPlus, Wallet } from "lucide-react";
import { useState, useTransition } from "react";
import { toast } from "sonner";
import { FriendPicker, useFriends } from "@/components/friends/friend-picker";
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
import { Field, FieldDescription, FieldError, FieldGroup, FieldLabel } from "@/components/ui/field";
import { Input } from "@/components/ui/input";
import { WalletSelect } from "@/components/wallets/wallet-select";
import { installmentDate } from "@/lib/committee";
import { dateInputToUTC, formatExpenseDate, todayInput } from "@/lib/dates";
import { formatCurrency } from "@/lib/format";
import { cn } from "@/lib/utils";
import {
  collectFromFriend,
  createCommittee,
  deleteCommittee,
  payInstallment,
  receivePayout,
  setCommitteeArchived,
  undoLastCollection,
  undoLastPayment,
  undoPayout,
  updateCommittee,
} from "@/server/actions/committees";
import type { CommitteeDTO, CommitteeStatus } from "@/server/queries/committees";
import type { ActionResult } from "@/types";

type Errors = Record<string, string | undefined>;

const monthYear = (d: string | Date) => formatExpenseDate(d, { month: "short", year: "numeric" });
const dayMonth = (d: string | Date) => formatExpenseDate(d, { day: "numeric", month: "short" });
const money = (raw: string) => raw.replace(/[^\d.]/g, "").slice(0, 12);
const digits = (raw: string) => raw.replace(/\D/g, "").slice(0, 2);

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
}: {
  id: string;
  value: string;
  onChange: (v: string) => void;
  invalid: boolean;
  autoFocus?: boolean;
}) {
  return (
    <div className="relative">
      <span className="pointer-events-none absolute inset-y-0 left-3 flex items-center text-sm text-muted-foreground">Rs.</span>
      <Input
        id={id}
        inputMode="decimal"
        placeholder="0.00"
        value={value}
        onChange={(e) => onChange(money(e.target.value))}
        className="pl-11 tabular-nums"
        aria-invalid={invalid}
        autoFocus={autoFocus}
      />
    </div>
  );
}

/** Fields copied when adding a friend's share in the same committee. */
type Prefill = { name: string; monthlyAmount: number; members: number; startDate: string; paidCount: number };

function CommitteeForm({ committee, prefill, onDone }: { committee?: CommitteeDTO; prefill?: Prefill; onDone: () => void }) {
  const base = committee ?? prefill;
  const [name, setName] = useState(base?.name ?? "");
  const [monthly, setMonthly] = useState(base ? String(base.monthlyAmount) : "");
  const [members, setMembers] = useState(base ? String(base.members) : "");
  const [turn, setTurn] = useState(committee ? String(committee.turn) : "");
  const [startDate, setStartDate] = useState(base?.startDate ?? todayInput());
  const [owner, setOwner] = useState<"me" | "friend">(committee?.forFriend || prefill ? "friend" : "me");
  const [friendId, setFriendId] = useState(committee?.forFriend?.id ?? "");
  const { friends, loaded, addFriend } = useFriends(owner === "friend", committee?.forFriend ? [committee.forFriend] : []);
  const ownerLocked = Boolean(committee && (committee.paidCount > 0 || committee.collectedCount > 0 || committee.received));
  const forFriend = owner === "friend";
  const [friendError, setFriendError] = useState<string | undefined>();
  const [paidBefore, setPaidBefore] = useState(prefill ? String(prefill.paidCount) : "0");
  const [notes, setNotes] = useState(committee?.notes ?? "");
  const { errors: serverErrors, clear: clearServer, isPending, submit } = useSubmit();
  const errors: Errors = { ...serverErrors, forFriendId: friendError ?? serverErrors.forFriendId };
  const clear = (k: string) => {
    if (k === "forFriendId") setFriendError(undefined);
    clearServer(k);
  };
  const dateLocked = Boolean(committee && committee.paidCount > 0);

  const count = Number(members);
  const myTurn = Number(turn);
  const validPreview = /^\d{4}-\d{2}-\d{2}$/.test(startDate) && count >= 2 && myTurn >= 1 && myTurn <= count && Number(monthly) > 0;

  const values = { name, monthlyAmount: monthly, members, turn, startDate, notes, forFriendId: forFriend ? friendId : "" };

  return (
    <form
      noValidate
      className="flex flex-col gap-5"
      onSubmit={(e) => {
        e.preventDefault();
        if (forFriend && !friendId) {
          setFriendError("Choose who this share is for");
          return;
        }
        submit(
          () => (committee ? updateCommittee(committee.id, values) : createCommittee({ ...values, paidBefore: paidBefore || "0" })),
          onDone,
        );
      }}
    >
      <FieldGroup className="gap-4">
        <Field data-invalid={Boolean(errors.forFriendId)}>
          <FieldLabel id="com-owner-label">Whose share is this?</FieldLabel>
          <div role="radiogroup" aria-labelledby="com-owner-label" className="grid grid-cols-2 gap-2">
            {(
              [
                ["me", "Mine"],
                ["friend", "A friend's"],
              ] as const
            ).map(([value, label]) => (
              <button
                key={value}
                type="button"
                role="radio"
                aria-checked={owner === value}
                disabled={ownerLocked}
                onClick={() => {
                  setOwner(value);
                  clear("forFriendId");
                }}
                className={cn(
                  "rounded-lg border px-3 py-2 text-sm transition-colors hover:bg-muted/60 disabled:pointer-events-none disabled:opacity-60",
                  owner === value ? "border-primary bg-primary/5 font-medium text-foreground" : "text-muted-foreground",
                )}
              >
                {label}
              </button>
            ))}
          </div>
          {forFriend && (
            <FriendPicker
              mode="single"
              id="com-friend"
              friends={friends}
              selectedIds={friendId ? [friendId] : []}
              loading={!loaded}
              invalid={Boolean(errors.forFriendId)}
              onToggle={(f) => {
                setFriendId(f.id);
                clear("forFriendId");
              }}
              onCreated={(f) => {
                addFriend(f);
                setFriendId(f.id);
                clear("forFriendId");
              }}
            />
          )}
          {errors.forFriendId ? (
            <FieldError>{errors.forFriendId}</FieldError>
          ) : (
            forFriend && (
              <FieldDescription>
                You pay this share and collect it back from them every month. The pot goes to them. It isn&apos;t your spending or savings.
              </FieldDescription>
            )
          )}
        </Field>
        <Field data-invalid={Boolean(errors.name)}>
          <FieldLabel htmlFor="com-name">Name</FieldLabel>
          <Input
            id="com-name"
            maxLength={60}
            placeholder="e.g. Office committee"
            value={name}
            onChange={(e) => {
              setName(e.target.value);
              clear("name");
            }}
            aria-invalid={Boolean(errors.name)}
            autoFocus
          />
          {errors.name && <FieldError>{errors.name}</FieldError>}
        </Field>
        <Field data-invalid={Boolean(errors.monthlyAmount)}>
          <FieldLabel htmlFor="com-monthly">Monthly amount</FieldLabel>
          <RupeeInput
            id="com-monthly"
            value={monthly}
            onChange={(v) => {
              setMonthly(v);
              clear("monthlyAmount");
            }}
            invalid={Boolean(errors.monthlyAmount)}
          />
          {errors.monthlyAmount && <FieldError>{errors.monthlyAmount}</FieldError>}
        </Field>
        <div className="grid gap-4 sm:grid-cols-2">
          <Field data-invalid={Boolean(errors.members)}>
            <FieldLabel htmlFor="com-members">Number of members</FieldLabel>
            <Input
              id="com-members"
              inputMode="numeric"
              placeholder="e.g. 10"
              value={members}
              onChange={(e) => {
                setMembers(digits(e.target.value));
                clear("members");
              }}
              aria-invalid={Boolean(errors.members)}
            />
            {errors.members && <FieldError>{errors.members}</FieldError>}
          </Field>
          <Field data-invalid={Boolean(errors.turn)}>
            <FieldLabel htmlFor="com-turn">{forFriend ? "Their turn (month number)" : "Your turn (month number)"}</FieldLabel>
            <Input
              id="com-turn"
              inputMode="numeric"
              placeholder="e.g. 6"
              value={turn}
              onChange={(e) => {
                setTurn(digits(e.target.value));
                clear("turn");
              }}
              aria-invalid={Boolean(errors.turn)}
            />
            {errors.turn && <FieldError>{errors.turn}</FieldError>}
          </Field>
        </div>
        <div className="grid gap-4 sm:grid-cols-2">
          <Field data-invalid={Boolean(errors.startDate)}>
            <FieldLabel htmlFor="com-start">First installment date</FieldLabel>
            <Input
              id="com-start"
              type="date"
              value={startDate}
              disabled={dateLocked}
              onChange={(e) => {
                setStartDate(e.target.value);
                clear("startDate");
              }}
              aria-invalid={Boolean(errors.startDate)}
            />
            {errors.startDate && <FieldError>{errors.startDate}</FieldError>}
          </Field>
          {!committee && (
            <Field data-invalid={Boolean(errors.paidBefore)}>
              <FieldLabel htmlFor="com-paid">Installments already paid</FieldLabel>
              <Input
                id="com-paid"
                inputMode="numeric"
                value={paidBefore}
                onChange={(e) => {
                  setPaidBefore(digits(e.target.value));
                  clear("paidBefore");
                }}
                aria-invalid={Boolean(errors.paidBefore)}
              />
              {errors.paidBefore ? (
                <FieldError>{errors.paidBefore}</FieldError>
              ) : (
                <FieldDescription>
                  These don&apos;t change today&apos;s wallet balances{forFriend ? " and are taken as already paid back" : ""}.
                </FieldDescription>
              )}
            </Field>
          )}
        </div>
        {validPreview && (
          <p className="rounded-md bg-muted/60 px-3 py-2 text-sm text-muted-foreground">
            Pot <span className="font-semibold text-foreground">{formatCurrency(Number(monthly) * count)}</span>, {forFriend ? "their" : "your"} turn around{" "}
            <span className="font-semibold text-foreground">{monthYear(installmentDate(dateInputToUTC(startDate), myTurn))}</span>.
          </p>
        )}
        <Field>
          <FieldLabel htmlFor="com-notes">
            Notes <span className="font-normal text-muted-foreground">(optional)</span>
          </FieldLabel>
          <Input id="com-notes" maxLength={500} value={notes} onChange={(e) => setNotes(e.target.value)} />
        </Field>
      </FieldGroup>
      <DialogFooter>
        <Button type="button" variant="ghost" onClick={onDone} disabled={isPending}>
          Cancel
        </Button>
        <Button type="submit" disabled={isPending}>
          {isPending && <Loader2 className="animate-spin" />}
          {committee ? "Save changes" : "Add committee"}
        </Button>
      </DialogFooter>
    </form>
  );
}

function CommitteeDialog({
  open,
  onOpenChange,
  committee,
  prefill,
}: {
  open: boolean;
  onOpenChange: (o: boolean) => void;
  committee?: CommitteeDTO;
  prefill?: Prefill;
}) {
  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-h-[92dvh] overflow-y-auto sm:max-w-lg">
        <DialogHeader>
          <DialogTitle>{committee ? `Edit ${committee.name}` : prefill ? "Add a friend's share" : "Add a committee"}</DialogTitle>
          <DialogDescription>Everyone pays monthly and each member gets the whole pot once. It isn&apos;t counted as spending.</DialogDescription>
        </DialogHeader>
        {open && <CommitteeForm committee={committee} prefill={prefill} onDone={() => onOpenChange(false)} />}
      </DialogContent>
    </Dialog>
  );
}

export function AddCommitteeButton({ label = "Add committee" }: { label?: string }) {
  const [open, setOpen] = useState(false);
  return (
    <>
      <Button onClick={() => setOpen(true)}>
        <Plus />
        {label}
      </Button>
      <CommitteeDialog open={open} onOpenChange={setOpen} />
    </>
  );
}

/** Shared by paying an installment and receiving the pot. */
function MoneyForm({
  defaultAmount,
  amountLabel,
  walletLabel,
  defaultWalletId,
  submitLabel,
  action,
  onDone,
  hideWallet = false,
}: {
  defaultAmount: number;
  amountLabel: string;
  hideWallet?: boolean;
  walletLabel: string;
  defaultWalletId: string;
  submitLabel: string;
  action: (v: { amount: string; date: string; walletId: string; note: string }) => Promise<ActionResult>;
  onDone: () => void;
}) {
  const [amount, setAmount] = useState(String(defaultAmount));
  const [date, setDate] = useState(todayInput());
  const [walletId, setWalletId] = useState(defaultWalletId);
  const { errors, clear, isPending, submit } = useSubmit();
  return (
    <form
      noValidate
      className="flex flex-col gap-5"
      onSubmit={(e) => {
        e.preventDefault();
        submit(() => action({ amount, date, walletId, note: "" }), onDone);
      }}
    >
      <FieldGroup className="gap-4">
        <Field data-invalid={Boolean(errors.amount)}>
          <FieldLabel htmlFor="com-amount">{amountLabel}</FieldLabel>
          <RupeeInput
            id="com-amount"
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
        <div className="grid gap-4 sm:grid-cols-2">
          <Field data-invalid={Boolean(errors.date)}>
            <FieldLabel htmlFor="com-date">Date</FieldLabel>
            <Input
              id="com-date"
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
          {!hideWallet && (
            <Field data-invalid={Boolean(errors.walletId)}>
              <FieldLabel htmlFor="com-wallet">
                {walletLabel} <span className="font-normal text-muted-foreground">(optional)</span>
              </FieldLabel>
              <WalletSelect
                id="com-wallet"
                value={walletId}
                onChange={(v) => {
                  setWalletId(v);
                  clear("walletId");
                }}
                invalid={Boolean(errors.walletId)}
              />
              {errors.walletId && <FieldError>{errors.walletId}</FieldError>}
            </Field>
          )}
        </div>
      </FieldGroup>
      <DialogFooter>
        <Button type="button" variant="ghost" onClick={onDone} disabled={isPending}>
          Cancel
        </Button>
        <Button type="submit" disabled={isPending}>
          {isPending && <Loader2 className="animate-spin" />}
          {submitLabel}
        </Button>
      </DialogFooter>
    </form>
  );
}

/** Pays the next installment. Shown on the Committees page and in Upcoming bills. */
export function PayCommitteeButton({ committee: c }: { committee: CommitteeDTO }) {
  const [open, setOpen] = useState(false);
  const { lastWalletId } = useLookups();
  // Use the wallet this committee was last paid from, or else the most recent one.
  const defaultWallet = c.payments.find((p) => p.wallet)?.wallet?.id ?? lastWalletId ?? "";
  if (c.nextInstallment === null) return null;
  return (
    <>
      <Button size="sm" onClick={() => setOpen(true)} aria-label={`Pay ${c.name}`}>
        Pay
      </Button>
      <Dialog open={open} onOpenChange={setOpen}>
        <DialogContent className="sm:max-w-md">
          <DialogHeader>
            <DialogTitle>
              Pay {c.name}: {c.nextInstallment} of {c.members}
            </DialogTitle>
            <DialogDescription>
              {c.forFriend
                ? `Paid for ${c.forFriend.name}. Collect it back from them; it isn't counted as your expense.`
                : "This leaves your wallet but isn't counted as an expense, because the pot comes back to you."}
            </DialogDescription>
          </DialogHeader>
          {open && (
            <MoneyForm
              defaultAmount={c.monthlyAmount}
              amountLabel="Amount paid"
              walletLabel="Paid from"
              defaultWalletId={defaultWallet}
              submitLabel="Record payment"
              action={(v) => payInstallment(c.id, v)}
              onDone={() => setOpen(false)}
            />
          )}
        </DialogContent>
      </Dialog>
    </>
  );
}

function ReceivePotButton({ committee: c }: { committee: CommitteeDTO }) {
  const [open, setOpen] = useState(false);
  const friend = c.forFriend;
  return (
    <>
      <Button
        size="sm"
        variant={c.payoutDue ? "default" : "outline"}
        onClick={() => setOpen(true)}
        aria-label={friend ? `Pot to ${friend.name} from ${c.name}` : `Receive pot from ${c.name}`}
      >
        <Wallet />
        {friend ? "Pot given" : "Receive pot"}
      </Button>
      <Dialog open={open} onOpenChange={setOpen}>
        <DialogContent className="sm:max-w-md">
          <DialogHeader>
            <DialogTitle>{friend ? `Pot of ${c.name} to ${friend.name}` : `Receive pot from ${c.name}`}</DialogTitle>
            <DialogDescription>
              {friend
                ? `The pot comes to you and you hand it to ${friend.name}, so your wallets don't change.`
                : "Goes into your wallet but isn't counted as income, because it's your own money coming back."}
            </DialogDescription>
          </DialogHeader>
          {open && (
            <MoneyForm
              defaultAmount={c.pot}
              amountLabel={friend ? "Pot amount" : "Amount received"}
              walletLabel="Received in"
              hideWallet={Boolean(friend)}
              defaultWalletId=""
              submitLabel="Save"
              action={(v) => receivePayout(c.id, v)}
              onDone={() => setOpen(false)}
            />
          )}
        </DialogContent>
      </Dialog>
    </>
  );
}

const STATUS_STYLE: Record<CommitteeStatus, string> = {
  overdue: "bg-destructive/10 text-destructive",
  today: "bg-warning/15 text-warning",
  soon: "bg-primary/10 text-primary",
  later: "bg-muted text-muted-foreground",
  done: "bg-success/10 text-success",
};

export function committeeDueText(c: CommitteeDTO) {
  const d = c.daysUntil ?? 0;
  if (c.status === "done") return "All paid";
  if (c.status === "overdue") return `Overdue by ${-d} day${d === -1 ? "" : "s"}`;
  if (c.status === "today") return "Due today";
  if (d === 1) return "Due tomorrow";
  if (c.status === "soon") return `Due in ${d} days`;
  return `Due ${dayMonth(c.nextDate!)}`;
}

export function collectDueText(c: CommitteeDTO) {
  const d = c.collectDaysUntil ?? 0;
  if (c.collectStatus === "done") return "All collected";
  if (c.collectStatus === "overdue") return `Late by ${-d} day${d === -1 ? "" : "s"}`;
  if (c.collectStatus === "today") return "Due today";
  if (d === 1) return "Due tomorrow";
  if (c.collectStatus === "soon") return `Due in ${d} days`;
  return `Due ${dayMonth(c.nextCollectionDate!)}`;
}

/** Records the friend paying back their share. Shown on the card and in Upcoming bills. */
export function CollectButton({ committee: c }: { committee: CommitteeDTO }) {
  const [open, setOpen] = useState(false);
  if (!c.forFriend || c.nextCollection === null) return null;
  return (
    <>
      <Button size="sm" variant="outline" onClick={() => setOpen(true)} aria-label={`Collect from ${c.forFriend.name} for ${c.name}`}>
        <HandCoins />
        Collect
      </Button>
      <Dialog open={open} onOpenChange={setOpen}>
        <DialogContent className="sm:max-w-md">
          <DialogHeader>
            <DialogTitle>
              Collect from {c.forFriend.name}: {c.nextCollection} of {c.members}
            </DialogTitle>
            <DialogDescription>Their committee share for {c.name}. Goes into your wallet but isn&apos;t income.</DialogDescription>
          </DialogHeader>
          {open && (
            <MoneyForm
              defaultAmount={c.monthlyAmount}
              amountLabel="Amount received"
              walletLabel="Received in"
              defaultWalletId={c.collections.find((p) => p.wallet)?.wallet?.id ?? ""}
              submitLabel="Save"
              action={(v) => collectFromFriend(c.id, v)}
              onDone={() => setOpen(false)}
            />
          )}
        </DialogContent>
      </Dialog>
    </>
  );
}

export function CommitteeCard({ committee: c }: { committee: CommitteeDTO }) {
  const [editing, setEditing] = useState(false);
  const [sharing, setSharing] = useState(false);
  const [deleting, setDeleting] = useState(false);
  const [open, setOpen] = useState(false);
  const { isPending, run } = useRun();
  const progress = Math.min(100, (c.paidCount / c.members) * 100);

  return (
    <Card className={cn("gap-3 px-5 py-4", c.archived && "opacity-70")}>
      <div className="flex items-start gap-3">
        <div className="min-w-0 flex-1">
          <p className="truncate font-medium">{c.name}</p>
          <p className="truncate text-xs text-muted-foreground">
            {formatCurrency(c.monthlyAmount)} a month · {c.members} members
          </p>
          {c.forFriend && <p className="truncate text-xs font-medium text-primary">For {c.forFriend.name}</p>}
        </div>
        <Badge variant="secondary" className={cn("shrink-0 border-0", STATUS_STYLE[c.status])}>
          {committeeDueText(c)}
        </Badge>
        <DropdownMenu>
          <DropdownMenuTrigger asChild>
            <Button variant="ghost" size="icon-sm" aria-label={`Options for ${c.name}`} disabled={isPending}>
              {isPending ? <Loader2 className="animate-spin" /> : <MoreVertical />}
            </Button>
          </DropdownMenuTrigger>
          <DropdownMenuContent align="end">
            <DropdownMenuItem onSelect={() => setEditing(true)}>
              <Pencil />
              Edit
            </DropdownMenuItem>
            {!c.forFriend && !c.archived && (
              <DropdownMenuItem onSelect={() => setSharing(true)}>
                <UserPlus />
                Add a friend&apos;s share
              </DropdownMenuItem>
            )}
            <DropdownMenuItem onSelect={() => run(() => setCommitteeArchived(c.id, !c.archived))}>
              {c.archived ? <ArchiveRestore /> : <Archive />}
              {c.archived ? "Restore" : "Archive"}
            </DropdownMenuItem>
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
          <span className="font-medium tabular-nums">
            {c.paidCount} of {c.members} paid
          </span>
          <span className="text-xs text-muted-foreground tabular-nums">{formatCurrency(c.paidTotal)}</span>
        </div>
        <div
          className="mt-1.5 h-2 overflow-hidden rounded-full bg-muted"
          role="progressbar"
          aria-label={`${c.name} installments paid`}
          aria-valuemin={0}
          aria-valuemax={c.members}
          aria-valuenow={c.paidCount}
        >
          <div className="h-full rounded-full bg-primary" style={{ width: `${progress}%` }} />
        </div>
      </div>

      <dl className="flex flex-col gap-1 text-sm">
        <div className="flex justify-between gap-3">
          <dt className="text-muted-foreground">
            {c.received ? (c.forFriend ? "Pot given" : "Pot received") : `${c.forFriend ? "Their" : "Your"} turn (#${c.turn})`}
          </dt>
          <dd className="text-right font-medium tabular-nums">
            {c.received
              ? `${formatCurrency(c.payoutAmount ?? 0)} · ${dayMonth(c.payoutAt!)}`
              : `${monthYear(c.payoutExpected)} · ${formatCurrency(c.pot)}`}
          </dd>
        </div>
        {c.forFriend ? (
          <>
            <div className="flex justify-between gap-3">
              <dt className="text-muted-foreground">
                {c.friendOwes < 0 ? `You're holding for ${c.forFriend.name}` : `${c.forFriend.name} owes you`}
              </dt>
              <dd className={cn("font-medium tabular-nums", c.friendOwes > 0 && "text-destructive")} data-testid="friend-owes">
                {formatCurrency(Math.abs(c.friendOwes))}
              </dd>
            </div>
            <div className="flex justify-between gap-3">
              <dt className="text-muted-foreground">
                Collected {c.collectedCount} of {c.members}
              </dt>
              <dd className={cn("text-right text-xs font-medium", c.collectStatus === "overdue" && "text-destructive")} data-testid="collect-due">
                {collectDueText(c)}
              </dd>
            </div>
          </>
        ) : (
          <div className="flex justify-between gap-3">
            <dt className="text-muted-foreground">{c.position < 0 ? "Still to pay back" : "Money in this committee"}</dt>
            <dd className={cn("font-medium tabular-nums", c.position < 0 && "text-destructive")} data-testid="position">
              {formatCurrency(Math.abs(c.position))}
            </dd>
          </div>
        )}
      </dl>

      <Collapsible open={open} onOpenChange={setOpen}>
        <div className="flex flex-wrap items-center gap-2">
          {!c.archived && <PayCommitteeButton committee={c} />}
          {!c.archived && <CollectButton committee={c} />}
          {!c.archived && !c.received && <ReceivePotButton committee={c} />}
          <CollapsibleTrigger asChild>
            <Button variant="ghost" size="sm" className="ml-auto" aria-label={open ? `Hide payments of ${c.name}` : `Show payments of ${c.name}`}>
              History
              <ChevronDown className={cn("transition-transform", open && "rotate-180")} />
            </Button>
          </CollapsibleTrigger>
        </div>
        <CollapsibleContent>
          <ul className="mt-3 flex flex-col divide-y border-t" aria-label={`Payments of ${c.name}`}>
            {c.received && (
              <li className="flex items-center gap-2 py-2 text-sm">
                <span className="min-w-0 flex-1 truncate">
                  Pot received · {formatExpenseDate(c.payoutAt!)}
                  {c.payoutWallet && ` · ${c.payoutWallet.name}`}
                </span>
                <span className="font-medium text-success tabular-nums">+{formatCurrency(c.payoutAmount ?? 0)}</span>
                <Button variant="ghost" size="icon-sm" aria-label="Undo pot received" disabled={isPending} onClick={() => run(() => undoPayout(c.id))}>
                  <Undo2 />
                </Button>
              </li>
            )}
            {c.collections.map((p, i) => (
              <li key={p.id} className="flex items-center gap-2 py-2 text-sm">
                <span className="min-w-0 flex-1 truncate">
                  Collected #{p.installment} · {formatExpenseDate(p.date)}
                  {p.wallet && ` · ${p.wallet.name}`}
                </span>
                <span className="font-medium text-success tabular-nums">+{formatCurrency(p.amount)}</span>
                {i === 0 ? (
                  <Button
                    variant="ghost"
                    size="icon-sm"
                    aria-label="Undo last collection"
                    disabled={isPending}
                    onClick={() => run(() => undoLastCollection(c.id))}
                  >
                    <Undo2 />
                  </Button>
                ) : (
                  <span className="size-7" aria-hidden />
                )}
              </li>
            ))}
            {c.payments.length === 0 && !c.received && <li className="py-2 text-sm text-muted-foreground">No installments yet.</li>}
            {c.payments.map((p, i) => (
              <li key={p.id} className="flex items-center gap-2 py-2 text-sm">
                <span className="min-w-0 flex-1 truncate">
                  #{p.installment} · {formatExpenseDate(p.date)}
                  {p.wallet && ` · ${p.wallet.name}`}
                </span>
                <span className="font-medium tabular-nums">−{formatCurrency(p.amount)}</span>
                {i === 0 ? (
                  <Button variant="ghost" size="icon-sm" aria-label="Undo last payment" disabled={isPending} onClick={() => run(() => undoLastPayment(c.id))}>
                    <Undo2 />
                  </Button>
                ) : (
                  <span className="size-7" aria-hidden />
                )}
              </li>
            ))}
          </ul>
        </CollapsibleContent>
      </Collapsible>

      <CommitteeDialog open={editing} onOpenChange={setEditing} committee={c} />
      <CommitteeDialog
        open={sharing}
        onOpenChange={setSharing}
        prefill={{ name: c.name, monthlyAmount: c.monthlyAmount, members: c.members, startDate: c.startDate, paidCount: c.paidCount }}
      />
      <AlertDialog open={deleting} onOpenChange={(o) => !isPending && setDeleting(o)}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>Delete {c.name}?</AlertDialogTitle>
            <AlertDialogDescription>
              This removes it and all {c.paidCount} recorded installments, as if it never happened. Any wallet balances it changed go back too.
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel disabled={isPending}>Cancel</AlertDialogCancel>
            <AlertDialogAction
              variant="destructive"
              disabled={isPending}
              onClick={(e) => {
                e.preventDefault();
                run(() => deleteCommittee(c.id), () => setDeleting(false));
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
