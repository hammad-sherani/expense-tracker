"use client";

import { Info, Loader2 } from "lucide-react";
import { useState, useTransition } from "react";
import { toast } from "sonner";
import { FriendPicker, useFriends } from "@/components/friends/friend-picker";
import { Button } from "@/components/ui/button";
import { Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { Field, FieldError, FieldGroup, FieldLabel } from "@/components/ui/field";
import { Input } from "@/components/ui/input";
import { todayInput } from "@/lib/dates";
import { cn } from "@/lib/utils";
import { createDue } from "@/server/actions/dues";

export type AddDueDefaults = { amount?: string; description?: string; date?: string };

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

type Direction = "OWED_TO_ME" | "I_OWE";

function AddDueForm({
  defaults,
  onDone,
  onCancel,
}: {
  defaults?: AddDueDefaults;
  onDone: () => void;
  onCancel: () => void;
}) {
  const { friends, loaded, addFriend } = useFriends(true);
  const [friendId, setFriendId] = useState("");
  const [direction, setDirection] = useState<Direction>("OWED_TO_ME");
  const [amount, setAmount] = useState(defaults?.amount ?? "");
  const [description, setDescription] = useState(defaults?.description ?? "");
  const [date, setDate] = useState(defaults?.date || todayInput());
  const [errors, setErrors] = useState<Record<string, string | undefined>>({});
  const [isPending, startTransition] = useTransition();
  /** Clears a field's error as soon as the user changes it. */
  const clear = (key: string) => setErrors((e) => (e[key] ? { ...e, [key]: undefined } : e));

  const submit = () => {
    setErrors({});
    startTransition(async () => {
      const result = await createDue({ friendId, direction, amount, description, date });
      if (!result.ok) {
        setErrors(Object.fromEntries(Object.entries(result.fieldErrors ?? {}).map(([k, v]) => [k, v?.[0]])));
        toast.error(result.error);
        return;
      }
      toast.success(result.message ?? "Due added", { description: "Not counted in your expenses." });
      onDone();
    });
  };

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
        <Field data-invalid={Boolean(errors.friendId)}>
          <FieldLabel htmlFor="due-person">Person</FieldLabel>
          <FriendPicker
            id="due-person"
            mode="single"
            friends={friends}
            loading={!loaded}
            selectedIds={friendId ? [friendId] : []}
            invalid={Boolean(errors.friendId)}
            onToggle={(f) => {
              setFriendId(f.id);
              clear("friendId");
            }}
            onCreated={(f) => {
              addFriend(f);
              setFriendId(f.id);
              clear("friendId");
            }}
          />
          {errors.friendId && <FieldError>{errors.friendId}</FieldError>}
        </Field>

        <div className="inline-flex w-fit rounded-lg bg-muted p-0.5" role="group" aria-label="Who owes whom">
          {(
            [
              { value: "OWED_TO_ME", label: "They owe me" },
              { value: "I_OWE", label: "I owe them" },
            ] as const
          ).map((o) => (
            <button
              key={o.value}
              type="button"
              aria-pressed={direction === o.value}
              onClick={() => setDirection(o.value)}
              className={cn(
                "rounded-md px-3 py-1.5 text-xs font-medium transition-colors",
                direction === o.value ? "bg-background text-foreground shadow-xs" : "text-muted-foreground hover:text-foreground",
              )}
            >
              {o.label}
            </button>
          ))}
        </div>

        <Field data-invalid={Boolean(errors.amount)}>
          <FieldLabel htmlFor="due-amount">Amount</FieldLabel>
          <div className="relative">
            <span className="pointer-events-none absolute inset-y-0 left-3 flex items-center text-sm text-muted-foreground">
              Rs.
            </span>
            <Input
              id="due-amount"
              inputMode="decimal"
              placeholder="0.00"
              value={amount}
              onChange={(e) => {
                setAmount(sanitizeAmount(e.target.value));
                clear("amount");
              }}
              className="pl-11 tabular-nums"
              aria-invalid={Boolean(errors.amount)}
            />
          </div>
          {errors.amount && <FieldError>{errors.amount}</FieldError>}
        </Field>

        <Field data-invalid={Boolean(errors.description)}>
          <FieldLabel htmlFor="due-description">What was it for?</FieldLabel>
          <Input
            id="due-description"
            placeholder="e.g. Groceries for home"
            maxLength={200}
            value={description}
            onChange={(e) => {
              setDescription(e.target.value);
              clear("description");
            }}
            aria-invalid={Boolean(errors.description)}
          />
          {errors.description && <FieldError>{errors.description}</FieldError>}
        </Field>

        <Field data-invalid={Boolean(errors.date)}>
          <FieldLabel htmlFor="due-date">Date</FieldLabel>
          <Input
            id="due-date"
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
      </FieldGroup>

      <p className="flex items-start gap-2 rounded-md bg-muted/60 px-3 py-2 text-xs text-muted-foreground">
        <Info className="mt-0.5 size-3.5 shrink-0" />
        This is tracked on the Dues page only and is not counted in your expenses.
      </p>

      <DialogFooter>
        <Button type="button" variant="ghost" onClick={onCancel} disabled={isPending}>
          Cancel
        </Button>
        <Button type="submit" disabled={isPending}>
          {isPending && <Loader2 className="animate-spin" />}
          Save due
        </Button>
      </DialogFooter>
    </form>
  );
}

/** Records money owed that isn't your own expense, e.g. something you paid for family. */
export function AddDueDialog({
  open,
  onOpenChange,
  defaults,
  onCreated,
}: {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  defaults?: AddDueDefaults;
  onCreated?: () => void;
}) {
  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-h-[92dvh] overflow-y-auto sm:max-w-md">
        <DialogHeader>
          <DialogTitle>Add a due</DialogTitle>
          <DialogDescription>
            Paid fully for someone else (like family), or someone paid for you? Track it here until it&apos;s paid back.
          </DialogDescription>
        </DialogHeader>
        {open && (
          <AddDueForm
            defaults={defaults}
            onCancel={() => onOpenChange(false)}
            onDone={() => {
              onOpenChange(false);
              onCreated?.();
            }}
          />
        )}
      </DialogContent>
    </Dialog>
  );
}
