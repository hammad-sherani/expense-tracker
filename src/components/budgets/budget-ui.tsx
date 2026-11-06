"use client";

import { Loader2, MoreVertical, Pencil, Plus, Target, Trash2 } from "lucide-react";
import { useState, useTransition } from "react";
import { toast } from "sonner";
import { CategoryIcon } from "@/components/expenses/category-badge";
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
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import { Field, FieldDescription, FieldError, FieldGroup, FieldLabel } from "@/components/ui/field";
import { Input } from "@/components/ui/input";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { OVERALL_BUDGET } from "@/lib/budgets";
import { categoryIcon } from "@/lib/category-icons";
import { formatCurrency, roundMoney } from "@/lib/format";
import { cn } from "@/lib/utils";
import { deleteBudget, saveBudget } from "@/server/actions/budgets";
import type { BudgetStatus } from "@/server/budgets";

const OVERALL = OVERALL_BUDGET;

function BudgetForm({
  budget,
  taken,
  onDone,
}: {
  budget?: BudgetStatus;
  /** Category ids (or OVERALL) that already have a budget. */
  taken: string[];
  onDone: () => void;
}) {
  const { categories } = useLookups();
  const [categoryId, setCategoryId] = useState(budget ? (budget.category?.id ?? OVERALL) : "");
  const [amount, setAmount] = useState(budget ? String(budget.amount) : "");
  const [errors, setErrors] = useState<Record<string, string | undefined>>({});
  const [isPending, startTransition] = useTransition();
  const options = categories.filter((c) => !c.archived || c.id === budget?.category?.id);
  const selected = options.find((c) => c.id === categoryId);
  const isTaken = (id: string) => taken.includes(id) && id !== (budget?.category?.id ?? (budget ? OVERALL : ""));

  const submit = () =>
    startTransition(async () => {
      if (!categoryId) {
        setErrors({ categoryId: "Choose what this budget covers" });
        return;
      }
      const r = await saveBudget({ categoryId: categoryId === OVERALL ? "" : categoryId, amount }, budget?.id);
      if (!r.ok) {
        setErrors(Object.fromEntries(Object.entries(r.fieldErrors ?? {}).map(([k, v]) => [k, v?.[0]])));
        toast.error(r.error);
        return;
      }
      toast.success(r.message);
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
        <Field data-invalid={Boolean(errors.categoryId)}>
          <FieldLabel htmlFor="budget-category">Budget for</FieldLabel>
          <Select
            value={categoryId}
            onValueChange={(v) => {
              setCategoryId(v);
              setErrors((e) => ({ ...e, categoryId: undefined }));
            }}
          >
            <SelectTrigger id="budget-category" className="w-full" aria-invalid={Boolean(errors.categoryId)}>
              <SelectValue placeholder="Choose a category">
                {categoryId === OVERALL ? "All spending (overall)" : (selected?.name ?? "Choose a category")}
              </SelectValue>
            </SelectTrigger>
            <SelectContent>
              <SelectItem value={OVERALL} disabled={isTaken(OVERALL)}>
                <Target />
                All spending (overall)
              </SelectItem>
              {options.map((c) => {
                const Icon = categoryIcon(c.icon);
                return (
                  <SelectItem key={c.id} value={c.id} disabled={isTaken(c.id)}>
                    <Icon style={{ color: c.color }} />
                    {c.name}
                    {isTaken(c.id) && <span className="text-xs text-muted-foreground">(has a budget)</span>}
                  </SelectItem>
                );
              })}
            </SelectContent>
          </Select>
          {errors.categoryId && <FieldError>{errors.categoryId}</FieldError>}
        </Field>
        <Field data-invalid={Boolean(errors.amount)}>
          <FieldLabel htmlFor="budget-amount">Monthly limit</FieldLabel>
          <div className="relative">
            <span className="pointer-events-none absolute inset-y-0 left-3 flex items-center text-sm text-muted-foreground">
              Rs.
            </span>
            <Input
              id="budget-amount"
              inputMode="decimal"
              placeholder="0.00"
              value={amount}
              onChange={(e) => {
                setAmount(e.target.value.replace(/[^\d.]/g, "").slice(0, 12));
                setErrors((x) => ({ ...x, amount: undefined }));
              }}
              className="pl-11 tabular-nums"
              aria-invalid={Boolean(errors.amount)}
            />
          </div>
          {errors.amount ? (
            <FieldError>{errors.amount}</FieldError>
          ) : (
            <FieldDescription>Applies every month. You&apos;ll get an alert at 80% and when you go over.</FieldDescription>
          )}
        </Field>
      </FieldGroup>
      <DialogFooter>
        <Button type="button" variant="ghost" onClick={onDone} disabled={isPending}>
          Cancel
        </Button>
        <Button type="submit" disabled={isPending}>
          {isPending && <Loader2 className="animate-spin" />}
          Save budget
        </Button>
      </DialogFooter>
    </form>
  );
}

export function BudgetDialog({
  open,
  onOpenChange,
  budget,
  taken,
}: {
  open: boolean;
  onOpenChange: (o: boolean) => void;
  budget?: BudgetStatus;
  taken: string[];
}) {
  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="sm:max-w-md">
        <DialogHeader>
          <DialogTitle>{budget ? "Edit budget" : "Set a budget"}</DialogTitle>
          <DialogDescription>A monthly spending limit for one category, or for everything.</DialogDescription>
        </DialogHeader>
        {open && <BudgetForm budget={budget} taken={taken} onDone={() => onOpenChange(false)} />}
      </DialogContent>
    </Dialog>
  );
}

export function AddBudgetButton({ taken, label = "Set a budget" }: { taken: string[]; label?: string }) {
  const [open, setOpen] = useState(false);
  return (
    <>
      <Button onClick={() => setOpen(true)}>
        <Plus />
        {label}
      </Button>
      <BudgetDialog open={open} onOpenChange={setOpen} taken={taken} />
    </>
  );
}

const TONE = {
  ok: { bar: "bg-success", text: "text-success" },
  warn: { bar: "bg-warning", text: "text-warning" },
  over: { bar: "bg-destructive", text: "text-destructive" },
} as const;

/** Progress bar for one budget. `compact` is used on the dashboard. */
export function BudgetProgress({
  budget,
  daysLeft,
  compact = false,
}: {
  budget: BudgetStatus;
  daysLeft?: number;
  compact?: boolean;
}) {
  const tone = TONE[budget.level];
  const name = budget.category?.name ?? "All spending";
  const perDay = daysLeft && budget.remaining > 0 ? roundMoney(budget.remaining / daysLeft) : 0;
  return (
    <div className="flex items-center gap-3">
      {budget.category ? (
        <CategoryIcon category={budget.category} size="sm" />
      ) : (
        <span className="flex size-7 shrink-0 items-center justify-center rounded-lg bg-primary/10 text-primary" aria-hidden>
          <Target className="size-3.5" />
        </span>
      )}
      <div className="min-w-0 flex-1">
        <div className="flex items-baseline justify-between gap-2 text-sm">
          <span className="truncate font-medium">{name}</span>
          <span className="shrink-0 tabular-nums">
            <span className="font-semibold">{formatCurrency(budget.spent)}</span>
            <span className="text-muted-foreground"> / {formatCurrency(budget.amount)}</span>
          </span>
        </div>
        <div
          className="mt-1.5 h-2 overflow-hidden rounded-full bg-muted"
          role="progressbar"
          aria-label={`${name} budget used`}
          aria-valuemin={0}
          aria-valuemax={100}
          aria-valuenow={Math.min(100, Math.round(budget.percent))}
        >
          <div className={cn("h-full rounded-full transition-[width]", tone.bar)} style={{ width: `${Math.min(100, budget.percent)}%` }} />
        </div>
        {!compact && (
          <p className="mt-1 flex justify-between gap-2 text-xs text-muted-foreground">
            <span className={cn(budget.level !== "ok" && tone.text)}>
              {budget.remaining >= 0
                ? `${formatCurrency(budget.remaining)} left`
                : `${formatCurrency(-budget.remaining)} over budget`}
            </span>
            <span>
              {Math.round(budget.percent)}% used
              {perDay > 0 && ` · ${formatCurrency(perDay)}/day for ${daysLeft} day${daysLeft === 1 ? "" : "s"}`}
            </span>
          </p>
        )}
      </div>
    </div>
  );
}

export function BudgetRow({ budget, daysLeft, taken }: { budget: BudgetStatus; daysLeft: number; taken: string[] }) {
  const [editing, setEditing] = useState(false);
  const [isPending, startTransition] = useTransition();
  return (
    <li className="flex items-center gap-2 px-4 py-3.5 sm:px-5">
      <div className="min-w-0 flex-1">
        <BudgetProgress budget={budget} daysLeft={daysLeft} />
      </div>
      <DropdownMenu>
        <DropdownMenuTrigger asChild>
          <Button
            variant="ghost"
            size="icon-sm"
            aria-label={`Options for ${budget.category?.name ?? "overall"} budget`}
            disabled={isPending}
          >
            {isPending ? <Loader2 className="animate-spin" /> : <MoreVertical />}
          </Button>
        </DropdownMenuTrigger>
        <DropdownMenuContent align="end">
          <DropdownMenuItem onSelect={() => setEditing(true)}>
            <Pencil />
            Edit
          </DropdownMenuItem>
          <DropdownMenuItem
            variant="destructive"
            onSelect={() =>
              startTransition(async () => {
                const r = await deleteBudget(budget.id);
                if (r.ok) toast.success(r.message);
                else toast.error(r.error);
              })
            }
          >
            <Trash2 />
            Remove
          </DropdownMenuItem>
        </DropdownMenuContent>
      </DropdownMenu>
      <BudgetDialog open={editing} onOpenChange={setEditing} budget={budget} taken={taken} />
    </li>
  );
}
