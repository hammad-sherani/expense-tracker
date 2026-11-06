"use client";

import { CalendarClock, HandCoins, Scale, Users, X } from "lucide-react";
import { useEffect, useMemo, useState } from "react";
import { FriendPicker, useFriends } from "@/components/friends/friend-picker";
import { useLookups } from "@/components/layout/lookups";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Switch } from "@/components/ui/switch";
import { formatCurrency } from "@/lib/format";
import { initials } from "@/lib/initials";
import { equalSplit, splitDifference } from "@/lib/split";
import { cn } from "@/lib/utils";
import type { ExpenseFormValues } from "@/lib/validations/expense";
import type { FriendDTO } from "@/types";

type Split = ExpenseFormValues["split"];

/** Same sanitising as the main amount field: digits and one dot, max 2 decimals. */
function sanitizeAmount(raw: string): string {
  let v = raw.replace(/,/g, "").replace(/[^\d.]/g, "");
  const firstDot = v.indexOf(".");
  if (firstDot !== -1) {
    v = v.slice(0, firstDot + 1) + v.slice(firstDot + 1).replace(/\./g, "");
    const [int, dec] = v.split(".");
    v = `${int}.${dec.slice(0, 2)}`;
  }
  return v.slice(0, 12);
}

const fmt = (n: number) => String(n);
const NO_GROUP = "__none__";

function withEqualShares(split: Split, total: number): Split {
  const valid = Number.isFinite(total) && total > 0;
  const shares = valid ? equalSplit(total, split.participants.length + 1) : [];
  return {
    ...split,
    myShare: valid ? fmt(shares[0]) : "",
    participants: split.participants.map((p, i) => ({ ...p, share: valid ? fmt(shares[i + 1]) : "" })),
  };
}


/**
 * Splits the bill between me and friends. Equal by default; editing any share
 * switches to custom amounts. `total` is the whole bill from the Amount field.
 */
export function SplitEditor({
  value,
  onChange,
  total,
  errors,
  initialFriends = [],
  onPaidForSomeone,
  groupId,
  onGroupChange,
}: {
  value: Split;
  onChange: (next: Split) => void;
  /** Trip/group the bill belongs to ("" = none). */
  groupId: string;
  onGroupChange: (groupId: string) => void;
  total: number;
  /** Friends already on this expense, so names show before the full list loads. */
  initialFriends?: FriendDTO[];
  /** When set (add mode only), shows "Paid fully for someone else?" which records a due instead. */
  onPaidForSomeone?: () => void;
  errors: { participants?: string; myShare?: string; paidBy?: string; shares: Record<number, string | undefined> };
}) {
  const { friends, loaded, addFriend } = useFriends(value.enabled, initialFriends);
  const { groups } = useLookups();
  const selectedGroup = groups.find((g) => g.id === groupId);
  // Saved split expenses open in custom mode so their shares aren't recalculated.
  // A prefilled split without amounts (e.g. adding to a group) starts equal.
  const [mode, setMode] = useState<"equal" | "custom">(
    value.enabled && value.participants.some((p) => p.share !== "") ? "custom" : "equal",
  );

  // Keep equal shares in sync with the total bill.
  useEffect(() => {
    if (!value.enabled || mode !== "equal") return;
    const next = withEqualShares(value, total);
    const same =
      next.myShare === value.myShare && next.participants.every((p, i) => p.share === value.participants[i]?.share);
    if (!same) onChange(next);
  }, [total, mode, value, onChange]);

  const nameOf = useMemo(() => {
    const map = new Map(friends.map((f) => [f.id, f.name]));
    return (id: string) => map.get(id) ?? "Friend";
  }, [friends]);

  const update = (next: Split) => onChange(mode === "equal" ? withEqualShares(next, total) : next);

  const toggleFriend = (friend: FriendDTO) => {
    const exists = value.participants.some((p) => p.friendId === friend.id);
    const participants = exists
      ? value.participants.filter((p) => p.friendId !== friend.id)
      : [...value.participants, { friendId: friend.id, share: "" }];
    const paidBy = participants.some((p) => p.friendId === value.paidBy) ? value.paidBy : "me";
    update({ ...value, participants, paidBy });
  };

  const iPaid = value.paidBy === "me";
  const firstShareError = Object.values(errors.shares).find(Boolean);
  const shares = value.participants.map((p) => Number(p.share) || 0);
  const diff = splitDifference(total || 0, Number(value.myShare) || 0, shares);
  const myShare = Number(value.myShare) || 0;
  const othersTotal = shares.reduce((a, s) => a + s, 0);

  if (!value.enabled) {
    return (
      <div className="flex flex-col gap-2">
        <div className="flex items-center justify-between gap-4 rounded-lg border border-dashed px-4 py-3">
          <div className="flex items-center gap-3">
            <Users className="size-4 text-muted-foreground" />
            <div>
              <p className="text-sm font-medium">Split with friends</p>
              <p className="text-xs text-muted-foreground">Paid for others too? Only your share counts as your expense.</p>
            </div>
          </div>
          <Switch
            aria-label="Split this bill"
            checked={false}
            onCheckedChange={(on) => on && onChange({ ...value, enabled: true })}
          />
        </div>
        {onPaidForSomeone && (
          <button
            type="button"
            onClick={onPaidForSomeone}
            className="inline-flex w-fit items-center gap-1.5 rounded px-1 text-xs font-medium text-primary hover:underline focus-visible:ring-3 focus-visible:ring-ring/50 focus-visible:outline-none"
          >
            <HandCoins className="size-3.5" />
            Paid fully for someone else? Record it as money they owe you
          </button>
        )}
      </div>
    );
  }

  return (
    <div className="flex flex-col gap-4 rounded-lg border bg-muted/30 p-4">
      <div className="flex items-center justify-between gap-4">
        <div className="flex items-center gap-3">
          <Users className="size-4 text-primary" />
          <p className="text-sm font-medium">Split with friends</p>
        </div>
        <Switch
          aria-label="Split this bill"
          checked
          onCheckedChange={(on) => {
            if (on) return;
            onChange({ enabled: false, paidBy: "me", myShare: "", participants: [], dueDate: "" });
            onGroupChange("");
          }}
        />
      </div>

      {groups.length > 0 && (
        <div className="flex flex-col gap-1.5 sm:flex-row sm:items-center sm:gap-3">
          <label htmlFor="split-group" className="text-sm font-medium">
            Group / trip <span className="font-normal text-muted-foreground">(optional)</span>
          </label>
          <Select
            value={groupId || NO_GROUP}
            onValueChange={(v) => {
              const id = v === NO_GROUP ? "" : v;
              onGroupChange(id);
              const g = groups.find((x) => x.id === id);
              if (!g) return;
              // Add the group's people to the split (keeps anyone already added).
              const missing = g.memberIds.filter((m) => !value.participants.some((p) => p.friendId === m));
              if (missing.length) update({ ...value, participants: [...value.participants, ...missing.map((m) => ({ friendId: m, share: "" }))] });
            }}
          >
            <SelectTrigger id="split-group" className="w-full sm:w-56">
              <SelectValue>{selectedGroup ? `${selectedGroup.emoji ?? ""} ${selectedGroup.name}`.trim() : "None"}</SelectValue>
            </SelectTrigger>
            <SelectContent>
              <SelectItem value={NO_GROUP}>None</SelectItem>
              {groups.map((g) => (
                <SelectItem key={g.id} value={g.id}>
                  {`${g.emoji ?? ""} ${g.name}`.trim()}
                </SelectItem>
              ))}
            </SelectContent>
          </Select>
        </div>
      )}

      <div className="flex flex-wrap items-center gap-2">
        <FriendPicker
          mode="multi"
          friends={friends}
          loading={!loaded}
          selectedIds={value.participants.map((p) => p.friendId)}
          onToggle={toggleFriend}
          onCreated={(f) => {
            addFriend(f);
            if (!value.participants.some((p) => p.friendId === f.id)) toggleFriend(f);
          }}
        />
        {value.participants.length > 0 && (
          <Button
            type="button"
            size="sm"
            variant={mode === "equal" ? "secondary" : "ghost"}
            onClick={() => {
              setMode("equal");
              onChange(withEqualShares(value, total));
            }}
          >
            <Scale />
            {mode === "equal" ? "Split equally" : "Reset to equal"}
          </Button>
        )}
      </div>

      {value.participants.length === 0 && (
        <p className="text-xs text-muted-foreground">
          Add the friends who shared this bill. You choose who paid it in the next step.
        </p>
      )}

      {value.participants.length > 0 && (
        <>
          <p className="text-xs text-muted-foreground">
            Each person&apos;s <span className="font-medium text-foreground">share of the bill</span>, meaning what their
            part cost, not who paid it.
          </p>
          <ul className="flex flex-col gap-2" aria-label="Shares">
            <li className="flex items-center gap-3">
              <span className="flex size-7 items-center justify-center rounded-full bg-primary/10 text-[10px] font-semibold text-primary">
                You
              </span>
              <span className="flex-1 text-sm font-medium">You</span>
              <ShareInput
                label="Your share"
                value={value.myShare}
                invalid={Boolean(errors.myShare)}
                onChange={(v) => {
                  setMode("custom");
                  onChange({ ...value, myShare: v });
                }}
              />
              <span className="w-7" />
            </li>
            {value.participants.map((p, i) => (
              <li key={p.friendId} className="flex items-center gap-3">
                <span className="flex size-7 items-center justify-center rounded-full bg-muted text-[10px] font-semibold">
                  {initials(nameOf(p.friendId))}
                </span>
                <span className="flex-1 truncate text-sm">{nameOf(p.friendId)}</span>
                <ShareInput
                  label={`${nameOf(p.friendId)}'s share`}
                  value={p.share}
                  invalid={Boolean(errors.shares[i])}
                  onChange={(v) => {
                    setMode("custom");
                    onChange({
                      ...value,
                      participants: value.participants.map((x, j) => (j === i ? { ...x, share: v } : x)),
                    });
                  }}
                />
                <Button
                  type="button"
                  variant="ghost"
                  size="icon-sm"
                  aria-label={`Remove ${nameOf(p.friendId)}`}
                  onClick={() => toggleFriend({ id: p.friendId, name: nameOf(p.friendId) })}
                >
                  <X />
                </Button>
              </li>
            ))}
          </ul>

          <div className="flex flex-col gap-1.5 sm:flex-row sm:items-center sm:gap-3">
            <label htmlFor="split-paid-by" className="text-sm font-medium">
              Who paid the bill?
            </label>
            <Select value={value.paidBy} onValueChange={(v) => onChange({ ...value, paidBy: v })}>
              <SelectTrigger id="split-paid-by" className="w-full sm:w-48" aria-invalid={Boolean(errors.paidBy)}>
                <SelectValue>{iPaid ? "You" : nameOf(value.paidBy)}</SelectValue>
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="me">You</SelectItem>
                {value.participants.map((p) => (
                  <SelectItem key={p.friendId} value={p.friendId}>
                    {nameOf(p.friendId)}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>

          <div className="flex flex-col gap-1.5 sm:flex-row sm:items-center sm:gap-3">
            <label htmlFor="split-due-date" className="flex items-center gap-1.5 text-sm font-medium">
              <CalendarClock className="size-3.5 text-muted-foreground" />
              Pay back by <span className="font-normal text-muted-foreground">(optional)</span>
            </label>
            <Input
              id="split-due-date"
              type="date"
              className="w-full sm:w-48"
              value={value.dueDate}
              onChange={(e) => onChange({ ...value, dueDate: e.target.value })}
            />
          </div>

          <div
            className={cn(
              "rounded-md px-3 py-2 text-sm",
              diff === 0 ? "bg-background text-muted-foreground" : "bg-destructive/10 text-destructive",
            )}
            aria-live="polite"
          >
            {diff !== 0 ? (
              diff > 0 ? (
                <>Shares are {formatCurrency(diff)} short of the total bill.</>
              ) : (
                <>Shares are {formatCurrency(-diff)} more than the total bill.</>
              )
            ) : (
              <>
                Your expense: <span className="font-semibold text-foreground">{formatCurrency(myShare)}</span>
                {" · "}
                {iPaid ? (
                  <>
                    friends owe you{" "}
                    <span className="font-semibold text-foreground">{formatCurrency(othersTotal)}</span>
                  </>
                ) : (
                  <>
                    you owe {nameOf(value.paidBy)}{" "}
                    <span className="font-semibold text-foreground">{formatCurrency(myShare)}</span>
                  </>
                )}
              </>
            )}
          </div>
        </>
      )}

      {(errors.participants || errors.myShare || errors.paidBy || firstShareError) && (
        <p role="alert" className="text-sm text-destructive">
          {errors.participants ?? errors.myShare ?? firstShareError ?? errors.paidBy}
        </p>
      )}
    </div>
  );
}

function ShareInput({
  label,
  value,
  onChange,
  invalid,
}: {
  label: string;
  value: string;
  onChange: (v: string) => void;
  invalid: boolean;
}) {
  return (
    <div className="relative w-32">
      <span className="pointer-events-none absolute inset-y-0 left-2.5 flex items-center text-xs text-muted-foreground">
        Rs.
      </span>
      <Input
        aria-label={label}
        inputMode="decimal"
        value={value}
        onChange={(e) => onChange(sanitizeAmount(e.target.value))}
        aria-invalid={invalid}
        className="h-8 pl-8 text-right tabular-nums"
      />
    </div>
  );
}
