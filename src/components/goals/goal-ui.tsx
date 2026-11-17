"use client";

import { Archive, ArchiveRestore, Banknote, Loader2, MoreVertical, Pencil, Plus, Trash2, Undo2, Wallet } from "lucide-react";
import { useRouter } from "next/navigation";
import { useState, useTransition } from "react";
import { toast } from "sonner";
import { useExpenseUI } from "@/components/expenses/expense-dialogs";
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
import { Button } from "@/components/ui/button";
import { Checkbox } from "@/components/ui/checkbox";
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
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { WalletSelect } from "@/components/wallets/wallet-select";
import { formatExpenseDate, todayInput } from "@/lib/dates";
import { formatCurrency } from "@/lib/format";
import { cn } from "@/lib/utils";
import {
  addMoney,
  createExpected,
  createGoal,
  deleteEntry,
  deleteExpected,
  deleteGoal,
  markReceived,
  setGoalArchived,
  undoReceived,
  updateExpected,
  updateGoal,
  withdrawMoney,
} from "@/server/actions/goals";
import type { ExpectedDTO, GoalDTO, GoalHistoryRow, GoalOption } from "@/server/queries/goals";
import type { ActionResult } from "@/types";

type Errors = Record<string, string | undefined>;

const NO_GOAL = "__none__";
const money = (raw: string) => {
  let v = raw.replace(/,/g, "").replace(/[^\d.]/g, "");
  const dot = v.indexOf(".");
  if (dot !== -1) v = v.slice(0, dot + 1) + v.slice(dot + 1).replace(/\./g, "").slice(0, 2);
  return v.slice(0, 12);
};

function useSubmit() {
  const [errors, setErrors] = useState<Errors>({});
  const [isPending, startTransition] = useTransition();
  const clear = (k: string) => setErrors((e) => (e[k] ? { ...e, [k]: undefined } : e));
  const submit = <T,>(fn: () => Promise<ActionResult<T>>, onDone: (data: T) => void) =>
    startTransition(async () => {
      const r = await fn();
      if (!r.ok) {
        setErrors(Object.fromEntries(Object.entries(r.fieldErrors ?? {}).map(([k, v]) => [k, v?.[0]])));
        toast.error(r.error);
        return;
      }
      toast.success(r.message);
      onDone(r.data);
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

/** The wallet project money and savings usually move through. */
function useDefaultWallet() {
  const { wallets, lastWalletId } = useLookups();
  return wallets.find((w) => w.type === "BANK" && !w.archived)?.id ?? lastWalletId ?? "";
}

function RupeeField({
  id,
  label,
  value,
  onChange,
  error,
  autoFocus,
  optional,
}: {
  id: string;
  label: string;
  value: string;
  onChange: (v: string) => void;
  error?: string;
  autoFocus?: boolean;
  optional?: boolean;
}) {
  return (
    <Field data-invalid={Boolean(error)}>
      <FieldLabel htmlFor={id}>
        {label} {optional && <span className="font-normal text-muted-foreground">(optional)</span>}
      </FieldLabel>
      <div className="relative">
        <span className="pointer-events-none absolute inset-y-0 left-3 flex items-center text-sm text-muted-foreground">Rs.</span>
        <Input
          id={id}
          inputMode="decimal"
          placeholder="0.00"
          value={value}
          onChange={(e) => onChange(money(e.target.value))}
          className="pl-11 tabular-nums"
          aria-invalid={Boolean(error)}
          autoFocus={autoFocus}
        />
      </div>
      {error && <FieldError>{error}</FieldError>}
    </Field>
  );
}

function FormButtons({ onCancel, pending, label }: { onCancel: () => void; pending: boolean; label: string }) {
  return (
    <DialogFooter>
      <Button type="button" variant="ghost" onClick={onCancel} disabled={pending}>
        Cancel
      </Button>
      <Button type="submit" disabled={pending}>
        {pending && <Loader2 className="animate-spin" />}
        {label}
      </Button>
    </DialogFooter>
  );
}

function GoalPicker({
  id,
  label,
  value,
  onChange,
  goals,
  error,
}: {
  id: string;
  label: string;
  value: string;
  onChange: (v: string) => void;
  goals: GoalOption[];
  error?: string;
}) {
  return (
    <Field data-invalid={Boolean(error)}>
      <FieldLabel htmlFor={id}>{label}</FieldLabel>
      <Select value={value || NO_GOAL} onValueChange={(v) => onChange(v === NO_GOAL ? "" : v)}>
        <SelectTrigger id={id} className="w-full" aria-invalid={Boolean(error)}>
          <SelectValue>{goals.find((g) => g.id === value)?.name ?? "No goal"}</SelectValue>
        </SelectTrigger>
        <SelectContent>
          <SelectItem value={NO_GOAL}>No goal</SelectItem>
          {goals.map((g) => (
            <SelectItem key={g.id} value={g.id}>
              {g.name}
            </SelectItem>
          ))}
        </SelectContent>
      </Select>
      {error && <FieldError>{error}</FieldError>}
    </Field>
  );
}

/* ------------------------------------------------------------------ */
/* Goals                                                               */
/* ------------------------------------------------------------------ */

function GoalForm({ goal, onDone }: { goal?: GoalDTO; onDone: (id?: string) => void }) {
  const [name, setName] = useState(goal?.name ?? "");
  const [target, setTarget] = useState(goal ? String(goal.targetAmount) : "");
  const [date, setDate] = useState(goal?.targetDate ?? "");
  const [notes, setNotes] = useState(goal?.notes ?? "");
  const [already, setAlready] = useState("");
  const [alreadyWallet, setAlreadyWallet] = useState("");
  const { errors, clear, isPending, submit } = useSubmit();
  return (
    <form
      noValidate
      className="flex flex-col gap-5"
      onSubmit={(e) => {
        e.preventDefault();
        const values = { name, targetAmount: target, targetDate: date, notes };
        if (goal) submit(() => updateGoal(goal.id, values), () => onDone());
        else submit(() => createGoal({ ...values, alreadySaved: already, alreadySavedWalletId: alreadyWallet }), (d) => onDone(d.id));
      }}
    >
      <FieldGroup className="gap-4">
        <Field data-invalid={Boolean(errors.name)}>
          <FieldLabel htmlFor="goal-name">What are you saving for?</FieldLabel>
          <Input
            id="goal-name"
            maxLength={60}
            placeholder="e.g. Nikkah"
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
        <div className="grid gap-4 sm:grid-cols-2">
          <RupeeField
            id="goal-target"
            label="Target amount"
            value={target}
            onChange={(v) => {
              setTarget(v);
              clear("targetAmount");
            }}
            error={errors.targetAmount}
          />
          <Field data-invalid={Boolean(errors.targetDate)}>
            <FieldLabel htmlFor="goal-date">
              Target date <span className="font-normal text-muted-foreground">(optional)</span>
            </FieldLabel>
            <Input
              id="goal-date"
              type="date"
              value={date}
              onChange={(e) => {
                setDate(e.target.value);
                clear("targetDate");
              }}
              aria-invalid={Boolean(errors.targetDate)}
            />
            {errors.targetDate && <FieldError>{errors.targetDate}</FieldError>}
          </Field>
        </div>
        {!goal && (
          <div className="grid gap-4 sm:grid-cols-2">
            <RupeeField
              id="goal-already"
              label="Already saved"
              optional
              value={already}
              onChange={(v) => {
                setAlready(v);
                clear("alreadySaved");
              }}
              error={errors.alreadySaved}
            />
            <Field data-invalid={Boolean(errors.alreadySavedWalletId)}>
              <FieldLabel htmlFor="goal-already-wallet">Take it from</FieldLabel>
              <WalletSelect id="goal-already-wallet" value={alreadyWallet} onChange={setAlreadyWallet} noneLabel="Not from a wallet" />
              <FieldDescription>Only pick a wallet if the money is counted in that wallet today.</FieldDescription>
            </Field>
          </div>
        )}
        <Field>
          <FieldLabel htmlFor="goal-notes">
            Notes <span className="font-normal text-muted-foreground">(optional)</span>
          </FieldLabel>
          <Input id="goal-notes" maxLength={500} value={notes} onChange={(e) => setNotes(e.target.value)} />
        </Field>
      </FieldGroup>
      <FormButtons onCancel={() => onDone()} pending={isPending} label={goal ? "Save changes" : "Create goal"} />
    </form>
  );
}

function GoalDialog({ open, onOpenChange, goal, onCreated }: { open: boolean; onOpenChange: (o: boolean) => void; goal?: GoalDTO; onCreated?: (id: string) => void }) {
  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-h-[92dvh] overflow-y-auto sm:max-w-lg">
        <DialogHeader>
          <DialogTitle>{goal ? `Edit ${goal.name}` : "New savings goal"}</DialogTitle>
          <DialogDescription>Set how much you need and by when. We&apos;ll work out what to save each month.</DialogDescription>
        </DialogHeader>
        {open && (
          <GoalForm
            goal={goal}
            onDone={(id) => {
              onOpenChange(false);
              if (id) onCreated?.(id);
            }}
          />
        )}
      </DialogContent>
    </Dialog>
  );
}

export function AddGoalButton({ label = "New goal" }: { label?: string }) {
  const [open, setOpen] = useState(false);
  const router = useRouter();
  return (
    <>
      <Button onClick={() => setOpen(true)}>
        <Plus />
        {label}
      </Button>
      <GoalDialog open={open} onOpenChange={setOpen} onCreated={(id) => router.push(`/goals/${id}`)} />
    </>
  );
}

function MoneyDialog({
  open,
  onOpenChange,
  goal,
  mode,
}: {
  open: boolean;
  onOpenChange: (o: boolean) => void;
  goal: GoalDTO;
  mode: "add" | "take";
}) {
  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="sm:max-w-md">
        <DialogHeader>
          <DialogTitle>
            {mode === "add" ? "Add money to" : "Take money out of"} {goal.name}
          </DialogTitle>
          <DialogDescription>
            {mode === "add"
              ? "Sets this money aside from your wallet. It isn't an expense."
              : `${formatCurrency(goal.balance)} is in this fund.`}
          </DialogDescription>
        </DialogHeader>
        {open && <MoneyForm goal={goal} mode={mode} onDone={() => onOpenChange(false)} />}
      </DialogContent>
    </Dialog>
  );
}

function MoneyForm({ goal, mode, onDone }: { goal: GoalDTO; mode: "add" | "take"; onDone: () => void }) {
  const defaultWallet = useDefaultWallet();
  const [amount, setAmount] = useState("");
  const [date, setDate] = useState(todayInput());
  const [walletId, setWalletId] = useState(defaultWallet);
  const { errors, clear, isPending, submit } = useSubmit();
  return (
    <form
      noValidate
      className="flex flex-col gap-5"
      onSubmit={(e) => {
        e.preventDefault();
        const values = { amount, date, walletId, note: "" };
        submit(() => (mode === "add" ? addMoney(goal.id, values) : withdrawMoney(goal.id, values)), onDone);
      }}
    >
      <FieldGroup className="gap-4">
        <RupeeField
          id="goal-money"
          label="Amount"
          value={amount}
          onChange={(v) => {
            setAmount(v);
            clear("amount");
          }}
          error={errors.amount}
          autoFocus
        />
        <div className="grid gap-4 sm:grid-cols-2">
          <Field data-invalid={Boolean(errors.date)}>
            <FieldLabel htmlFor="goal-money-date">Date</FieldLabel>
            <Input
              id="goal-money-date"
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
          <Field data-invalid={Boolean(errors.walletId)}>
            <FieldLabel htmlFor="goal-money-wallet">{mode === "add" ? "From wallet" : "Back to wallet"}</FieldLabel>
            <WalletSelect id="goal-money-wallet" value={walletId} onChange={setWalletId} noneLabel="No wallet" invalid={Boolean(errors.walletId)} />
            {errors.walletId && <FieldError>{errors.walletId}</FieldError>}
          </Field>
        </div>
      </FieldGroup>
      <FormButtons onCancel={onDone} pending={isPending} label={mode === "add" ? "Add money" : "Take out"} />
    </form>
  );
}

/** Add money / Take out / Pay from fund / options on a goal's own page. */
export function GoalButtons({ goal }: { goal: GoalDTO }) {
  const [money, setMoney] = useState<"add" | "take" | null>(null);
  const [lastMode, setLastMode] = useState<"add" | "take">("add");
  const [editing, setEditing] = useState(false);
  const [deleting, setDeleting] = useState(false);
  const { openCreate } = useExpenseUI();
  const { isPending, run } = useRun();
  const router = useRouter();
  const open = (m: "add" | "take") => {
    setLastMode(m);
    setMoney(m);
  };
  return (
    <>
      {!goal.archived && (
        <>
          <Button onClick={() => open("add")}>
            <Plus />
            Add money
          </Button>
          <Button variant="outline" disabled={goal.balance <= 0} onClick={() => open("take")}>
            <Wallet />
            Take out
          </Button>
          <Button
            variant="outline"
            disabled={goal.balance <= 0}
            onClick={() =>
              openCreate({
                title: `Pay from ${goal.name} fund`,
                description: "Recorded as an expense, paid from this fund. Your wallets won't change.",
                fundName: goal.name,
                defaults: { goalId: goal.id, walletId: "" },
              })
            }
          >
            <Banknote />
            Pay from fund
          </Button>
        </>
      )}
      <DropdownMenu>
        <DropdownMenuTrigger asChild>
          <Button variant="outline" size="icon" aria-label={`Options for ${goal.name}`} disabled={isPending}>
            {isPending ? <Loader2 className="animate-spin" /> : <MoreVertical />}
          </Button>
        </DropdownMenuTrigger>
        <DropdownMenuContent align="end">
          <DropdownMenuItem onSelect={() => setEditing(true)}>
            <Pencil />
            Edit
          </DropdownMenuItem>
          <DropdownMenuItem onSelect={() => run(() => setGoalArchived(goal.id, !goal.archived))}>
            {goal.archived ? <ArchiveRestore /> : <Archive />}
            {goal.archived ? "Restore" : "Archive"}
          </DropdownMenuItem>
          <DropdownMenuSeparator />
          <DropdownMenuItem variant="destructive" onSelect={() => setDeleting(true)}>
            <Trash2 />
            Delete
          </DropdownMenuItem>
        </DropdownMenuContent>
      </DropdownMenu>

      <MoneyDialog open={money !== null} onOpenChange={(o) => !o && setMoney(null)} goal={goal} mode={money ?? lastMode} />
      <GoalDialog open={editing} onOpenChange={setEditing} goal={goal} />
      <AlertDialog open={deleting} onOpenChange={(o) => !isPending && setDeleting(o)}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>Delete {goal.name}?</AlertDialogTitle>
            <AlertDialogDescription>
              The goal and everything added to it are removed, and any money set aside goes back to its wallet. Project payments stay as income.
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel disabled={isPending}>Cancel</AlertDialogCancel>
            <AlertDialogAction
              variant="destructive"
              disabled={isPending}
              onClick={(e) => {
                e.preventDefault();
                run(() => deleteGoal(goal.id), () => router.push("/goals"));
                setDeleting(false);
              }}
            >
              {isPending && <Loader2 className="animate-spin" />}
              Delete
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </>
  );
}

export function GoalHistory({ rows }: { rows: GoalHistoryRow[] }) {
  return (
    <ul className="divide-y" aria-label="Fund history">
      {rows.map((r) => (
        <HistoryRow key={r.id} row={r} />
      ))}
    </ul>
  );
}

function HistoryRow({ row }: { row: GoalHistoryRow }) {
  const { isPending, run } = useRun();
  const entryId = row.entryId;
  return (
    <li className="flex items-center gap-3 px-4 py-3 sm:px-5">
      <div className="min-w-0 flex-1">
        <p className="truncate text-sm font-medium">{row.title}</p>
        <p className="truncate text-xs text-muted-foreground">
          {formatExpenseDate(row.date)} · {row.subtitle}
        </p>
      </div>
      <span className={cn("shrink-0 text-sm font-semibold tabular-nums", row.amount > 0 && "text-success")}>
        {row.amount > 0 ? "+" : "−"}
        {formatCurrency(Math.abs(row.amount))}
      </span>
      {entryId ? (
        <Button
          variant="ghost"
          size="icon-sm"
          aria-label={`Remove ${row.title}`}
          className="text-muted-foreground hover:text-destructive"
          disabled={isPending}
          onClick={() => run(() => deleteEntry(entryId))}
        >
          {isPending ? <Loader2 className="animate-spin" /> : <Trash2 />}
        </Button>
      ) : (
        <span className="size-7 shrink-0" aria-hidden />
      )}
    </li>
  );
}

/* ------------------------------------------------------------------ */
/* Expected (project) payments                                         */
/* ------------------------------------------------------------------ */

function ExpectedForm({
  payment,
  goals,
  defaultGoalId,
  onDone,
}: {
  payment?: ExpectedDTO;
  goals: GoalOption[];
  defaultGoalId?: string;
  onDone: () => void;
}) {
  const [source, setSource] = useState(payment?.source ?? "");
  const [amount, setAmount] = useState(payment ? String(payment.amount) : "");
  const [date, setDate] = useState(payment?.expectedDate ?? todayInput());
  const [goalId, setGoalId] = useState(payment ? (payment.goal?.id ?? "") : (defaultGoalId ?? goals[0]?.id ?? ""));
  const [goalAmount, setGoalAmount] = useState(payment?.goalAmount != null ? String(payment.goalAmount) : "");
  const { errors, clear, isPending, submit } = useSubmit();
  return (
    <form
      noValidate
      className="flex flex-col gap-5"
      onSubmit={(e) => {
        e.preventDefault();
        const values = { source, amount, expectedDate: date, goalId, goalAmount, notes: "" };
        submit(() => (payment ? updateExpected(payment.id, values) : createExpected(values)), onDone);
      }}
    >
      <FieldGroup className="gap-4">
        <Field data-invalid={Boolean(errors.source)}>
          <FieldLabel htmlFor="exp-source">Project or source</FieldLabel>
          <Input
            id="exp-source"
            maxLength={100}
            placeholder="e.g. Website project"
            value={source}
            onChange={(e) => {
              setSource(e.target.value);
              clear("source");
            }}
            aria-invalid={Boolean(errors.source)}
            autoFocus
          />
          {errors.source && <FieldError>{errors.source}</FieldError>}
        </Field>
        <div className="grid gap-4 sm:grid-cols-2">
          <RupeeField
            id="exp-amount"
            label="Amount"
            value={amount}
            onChange={(v) => {
              setAmount(v);
              clear("amount");
            }}
            error={errors.amount}
          />
          <Field data-invalid={Boolean(errors.expectedDate)}>
            <FieldLabel htmlFor="exp-date">Expected date</FieldLabel>
            <Input
              id="exp-date"
              type="date"
              value={date}
              onChange={(e) => {
                setDate(e.target.value);
                clear("expectedDate");
              }}
              aria-invalid={Boolean(errors.expectedDate)}
            />
            {errors.expectedDate && <FieldError>{errors.expectedDate}</FieldError>}
          </Field>
        </div>
        <div className="grid gap-4 sm:grid-cols-2">
          <GoalPicker id="exp-goal" label="For goal" value={goalId} onChange={setGoalId} goals={goals} error={errors.goalId} />
          {goalId && (
            <Field data-invalid={Boolean(errors.goalAmount)}>
              <RupeeField
                id="exp-goal-amount"
                label="Planned for the goal"
                optional
                value={goalAmount}
                onChange={(v) => {
                  setGoalAmount(v);
                  clear("goalAmount");
                }}
                error={errors.goalAmount}
              />
              {!errors.goalAmount && <FieldDescription>Leave empty to plan all of it. You can change this when it arrives.</FieldDescription>}
            </Field>
          )}
        </div>
      </FieldGroup>
      <FormButtons onCancel={onDone} pending={isPending} label={payment ? "Save changes" : "Add payment"} />
    </form>
  );
}

function ExpectedDialog({
  open,
  onOpenChange,
  payment,
  goals,
  defaultGoalId,
}: {
  open: boolean;
  onOpenChange: (o: boolean) => void;
  payment?: ExpectedDTO;
  goals: GoalOption[];
  defaultGoalId?: string;
}) {
  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-h-[92dvh] overflow-y-auto sm:max-w-lg">
        <DialogHeader>
          <DialogTitle>{payment ? `Edit ${payment.source}` : "Expected payment"}</DialogTitle>
          <DialogDescription>Money you&apos;re expecting, like a project payment. It isn&apos;t income until you mark it received.</DialogDescription>
        </DialogHeader>
        {open && <ExpectedForm payment={payment} goals={goals} defaultGoalId={defaultGoalId} onDone={() => onOpenChange(false)} />}
      </DialogContent>
    </Dialog>
  );
}

export function AddExpectedButton({ goals, defaultGoalId, variant = "default" }: { goals: GoalOption[]; defaultGoalId?: string; variant?: "default" | "outline" }) {
  const [open, setOpen] = useState(false);
  return (
    <>
      <Button variant={variant} onClick={() => setOpen(true)}>
        <Plus />
        Add expected payment
      </Button>
      <ExpectedDialog open={open} onOpenChange={setOpen} goals={goals} defaultGoalId={defaultGoalId} />
    </>
  );
}

function ReceivedForm({ payment: p, goals, onDone }: { payment: ExpectedDTO; goals: GoalOption[]; onDone: () => void }) {
  const defaultWallet = useDefaultWallet();
  const [amount, setAmount] = useState(String(p.amount));
  const [date, setDate] = useState(todayInput());
  const [walletId, setWalletId] = useState(defaultWallet);
  const [goalId, setGoalId] = useState(p.goal?.id ?? "");
  const [goalAmount, setGoalAmount] = useState(p.goal ? String(p.goalAmount ?? p.amount) : "");
  const [expectRest, setExpectRest] = useState(true);
  const { errors, clear, isPending, submit } = useSubmit();
  const received = Number(amount) || 0;
  const share = goalId ? Number(goalAmount) || 0 : 0;
  const rest = p.amount - received;
  return (
    <form
      noValidate
      className="flex flex-col gap-5"
      onSubmit={(e) => {
        e.preventDefault();
        submit(() => markReceived(p.id, { amount, date, walletId, goalId, goalAmount: goalId ? goalAmount : "", expectRest }), onDone);
      }}
    >
      <FieldGroup className="gap-4">
        <RupeeField
          id="rec-amount"
          label="Amount received"
          value={amount}
          onChange={(v) => {
            setAmount(v);
            clear("amount");
          }}
          error={errors.amount}
          autoFocus
        />
        {rest > 0 && received > 0 && (
          <label className="flex items-center gap-2 text-sm">
            <Checkbox checked={expectRest} onCheckedChange={(v) => setExpectRest(v === true)} aria-label="Expecting the rest later" />
            Expecting the remaining {formatCurrency(rest)} later
          </label>
        )}
        <div className="grid gap-4 sm:grid-cols-2">
          <Field data-invalid={Boolean(errors.date)}>
            <FieldLabel htmlFor="rec-date">Date received</FieldLabel>
            <Input
              id="rec-date"
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
          <Field data-invalid={Boolean(errors.walletId)}>
            <FieldLabel htmlFor="rec-wallet">Received in</FieldLabel>
            <WalletSelect id="rec-wallet" value={walletId} onChange={setWalletId} noneLabel="No wallet" invalid={Boolean(errors.walletId)} />
            {errors.walletId && <FieldError>{errors.walletId}</FieldError>}
          </Field>
        </div>
        <div className="grid gap-4 sm:grid-cols-2">
          <GoalPicker id="rec-goal" label="Goes to goal" value={goalId} onChange={setGoalId} goals={goals} error={errors.goalId} />
          {goalId && (
            <RupeeField
              id="rec-goal-amount"
              label="Amount for the goal"
              value={goalAmount}
              onChange={(v) => {
                setGoalAmount(v);
                clear("goalAmount");
              }}
              error={errors.goalAmount}
            />
          )}
        </div>
        {received > 0 && (
          <p className="rounded-md bg-muted/60 px-3 py-2 text-sm text-muted-foreground" data-testid="received-preview">
            {formatCurrency(received)} is added as income.{" "}
            {share > 0 && (
              <>
                {formatCurrency(share)} goes to the fund and <span className="font-semibold text-foreground">{formatCurrency(received - share)}</span> stays free.
              </>
            )}
          </p>
        )}
      </FieldGroup>
      <FormButtons onCancel={onDone} pending={isPending} label="Save" />
    </form>
  );
}

export function ExpectedRow({ payment: p, goals }: { payment: ExpectedDTO; goals: GoalOption[] }) {
  const [receiving, setReceiving] = useState(false);
  const [editing, setEditing] = useState(false);
  const { isPending, run } = useRun();

  if (p.received) {
    return (
      <li className="flex items-center gap-3 px-4 py-3 sm:px-5">
        <div className="min-w-0 flex-1">
          <p className="truncate text-sm font-medium">{p.source}</p>
          <p className="truncate text-xs text-muted-foreground">
            Received {formatExpenseDate(p.receivedAt!)}
            {p.toFund > 0 && ` · ${formatCurrency(p.toFund)} to ${p.goal?.name ?? "fund"}`}
          </p>
        </div>
        <span className="shrink-0 text-sm font-semibold text-success tabular-nums">+{formatCurrency(p.receivedAmount ?? 0)}</span>
        <Button variant="ghost" size="icon-sm" aria-label={`Undo ${p.source} received`} disabled={isPending} onClick={() => run(() => undoReceived(p.id))}>
          {isPending ? <Loader2 className="animate-spin" /> : <Undo2 />}
        </Button>
      </li>
    );
  }

  return (
    <li className="flex flex-wrap items-center gap-3 px-4 py-3 sm:flex-nowrap sm:px-5">
      <div className="min-w-0 flex-1 basis-40">
        <p className="truncate text-sm font-medium">{p.source}</p>
        <p className={cn("truncate text-xs", p.overdue ? "text-destructive" : "text-muted-foreground")}>
          {p.overdue ? "Overdue · was expected" : "Expected"} {formatExpenseDate(p.expectedDate)}
          {p.goal && ` · for ${p.goal.name}${p.goalAmount != null && p.goalAmount !== p.amount ? ` (${formatCurrency(p.goalAmount)})` : ""}`}
        </p>
      </div>
      <span className="shrink-0 text-sm font-semibold tabular-nums">{formatCurrency(p.amount)}</span>
      <div className="ml-auto flex items-center gap-1">
        <Button size="sm" onClick={() => setReceiving(true)} aria-label={`Received ${p.source}`}>
          Received
        </Button>
        <DropdownMenu>
          <DropdownMenuTrigger asChild>
            <Button variant="ghost" size="icon-sm" aria-label={`Options for ${p.source}`} disabled={isPending}>
              {isPending ? <Loader2 className="animate-spin" /> : <MoreVertical />}
            </Button>
          </DropdownMenuTrigger>
          <DropdownMenuContent align="end">
            <DropdownMenuItem onSelect={() => setEditing(true)}>
              <Pencil />
              Edit
            </DropdownMenuItem>
            <DropdownMenuItem variant="destructive" onSelect={() => run(() => deleteExpected(p.id))}>
              <Trash2 />
              Remove
            </DropdownMenuItem>
          </DropdownMenuContent>
        </DropdownMenu>
      </div>
      <Dialog open={receiving} onOpenChange={setReceiving}>
        <DialogContent className="max-h-[92dvh] overflow-y-auto sm:max-w-lg">
          <DialogHeader>
            <DialogTitle>Received: {p.source}</DialogTitle>
            <DialogDescription>Added to your income. Choose how much goes to your goal.</DialogDescription>
          </DialogHeader>
          {receiving && <ReceivedForm payment={p} goals={goals} onDone={() => setReceiving(false)} />}
        </DialogContent>
      </Dialog>
      <ExpectedDialog open={editing} onOpenChange={setEditing} payment={p} goals={goals} />
    </li>
  );
}
