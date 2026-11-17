"use client";

import { Bell, CalendarClock, Loader2, MoreVertical, Pencil, Plus, Trash2 } from "lucide-react";
import { useState, useTransition } from "react";
import { toast } from "sonner";
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
import { Card, CardAction, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Checkbox } from "@/components/ui/checkbox";
import { Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { DropdownMenu, DropdownMenuContent, DropdownMenuItem, DropdownMenuTrigger } from "@/components/ui/dropdown-menu";
import { Field, FieldDescription, FieldError, FieldGroup, FieldLabel } from "@/components/ui/field";
import { Input } from "@/components/ui/input";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Switch } from "@/components/ui/switch";
import { formatExpenseDate, todayInput } from "@/lib/dates";
import { formatCurrency } from "@/lib/format";
import { estimateTax } from "@/lib/income-tax";
import { TAX_TAG_KEYS, TAX_TAGS, type TaxTagValue, WITHHOLDING_TYPE_KEYS, WITHHOLDING_TYPES, type WithholdingTypeValue } from "@/lib/tax-rates";
import { taxYearLabel, taxYearMonthLabel } from "@/lib/tax-year";
import { cn } from "@/lib/utils";
import {
  createReminder,
  createWithholding,
  deleteReminder,
  deleteWithholding,
  setCategoryTaxTag,
  setExpenseTaxExcluded,
  updateReminder,
  updateWithholding,
} from "@/server/actions/tax";
import type { TaxYearData, WithholdingDTO } from "@/server/queries/tax";
import type { DeadlineDTO } from "@/server/tax-deadlines";
import type { ActionResult } from "@/types";

type Errors = Record<string, string | undefined>;
const money = (raw: string) => raw.replace(/[^\d.]/g, "").slice(0, 12);
const pct = (n: number) => `${Math.round(n * 1000) / 10}%`;

function useSubmit() {
  const [errors, setErrors] = useState<Errors>({});
  const [isPending, startTransition] = useTransition();
  const clear = (k: string) => setErrors((e) => (e[k] ? { ...e, [k]: undefined } : e));
  const submit = (fn: () => Promise<ActionResult>, onDone: () => void) =>
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
  const run = (fn: () => Promise<ActionResult>, after?: () => void) =>
    startTransition(async () => {
      const r = await fn();
      if (r.ok) {
        toast.success(r.message);
        after?.();
      } else toast.error(r.error);
    });
  return { isPending, run };
}

function RupeeInput({ id, value, onChange, invalid }: { id: string; value: string; onChange: (v: string) => void; invalid?: boolean }) {
  return (
    <div className="relative">
      <span className="pointer-events-none absolute inset-y-0 left-3 flex items-center text-sm text-muted-foreground">Rs.</span>
      <Input
        id={id}
        inputMode="decimal"
        placeholder="0"
        value={value}
        onChange={(e) => onChange(money(e.target.value))}
        className="pl-11 tabular-nums"
        aria-invalid={invalid}
      />
    </div>
  );
}

function Row({ label, value, strong, testId, muted }: { label: React.ReactNode; value: string; strong?: boolean; testId?: string; muted?: boolean }) {
  return (
    <div className={cn("flex justify-between gap-3", strong && "border-t pt-2 font-semibold")}>
      <dt className={cn(!strong && "text-muted-foreground")}>{label}</dt>
      <dd className={cn("text-right tabular-nums", muted && "text-muted-foreground")} data-testid={testId}>
        {value}
      </dd>
    </div>
  );
}

/* ------------------------------------------------------------------ estimate */

export function TaxEstimateCard({ data }: { data: TaxYearData }) {
  const left = data.salaryMonthsLeft;
  const [monthly, setMonthly] = useState(data.avgGross ? String(data.avgGross) : "");
  const [monthlyTax, setMonthlyTax] = useState(data.avgWithheld ? String(data.avgWithheld) : "");
  const counted = (tag: TaxTagValue) => data.deductions[tag].filter((d) => !d.excluded).reduce((a, d) => a + d.amount, 0);
  const projected = Number(monthly || 0) * left;
  const projectedTax = Number(monthlyTax || 0) * left;
  const r = estimateTax(data.rules, {
    salaryToDate: data.salaryToDate,
    salaryProjected: projected,
    zakat: counted("ZAKAT"),
    donations: counted("DONATION"),
    pension: counted("PENSION"),
    adjustableWithheld: data.employerTaxToDate + projectedTax + data.otherAdjustable,
    monthsLeft: left,
  });
  const owe = r.balance > 0;

  return (
    <Card className="gap-4 px-5 py-4" data-testid="tax-estimate">
      <div className="flex flex-wrap items-end justify-between gap-x-6 gap-y-2">
        <div>
          <p className="text-sm font-medium text-muted-foreground">Estimated income tax for {taxYearLabel(data.taxYear, true)}</p>
          <p className="mt-1 text-3xl font-semibold tracking-tight tabular-nums" data-testid="tax-total">
            {formatCurrency(r.tax)}
          </p>
          <p className="text-xs text-muted-foreground">
            On a salary of {formatCurrency(r.salary)} · average rate {r.avgRatePct}%
          </p>
        </div>
        <div className="text-right">
          <p className="text-sm font-medium text-muted-foreground">{owe ? "Still to pay" : r.balance < 0 ? "Refund due" : "Nothing more to pay"}</p>
          <p className={cn("mt-1 text-2xl font-semibold tabular-nums", owe ? "text-destructive" : "text-success")} data-testid="tax-balance">
            {formatCurrency(Math.abs(r.balance))}
          </p>
          {owe && left > 0 && (
            <p className="text-xs text-muted-foreground" data-testid="tax-set-aside">
              Set aside {formatCurrency(r.monthlySetAside)} a month
            </p>
          )}
        </div>
      </div>

      {left > 0 && (
        <div className="grid gap-3 rounded-lg bg-muted/50 p-3 sm:grid-cols-2">
          <Field>
            <FieldLabel htmlFor="tax-monthly">Expected gross salary a month</FieldLabel>
            <RupeeInput id="tax-monthly" value={monthly} onChange={setMonthly} />
            <FieldDescription>
              For the {left} month{left === 1 ? "" : "s"} not recorded yet{data.avgGross ? " (your recent average)" : ""}.
            </FieldDescription>
          </Field>
          <Field>
            <FieldLabel htmlFor="tax-monthly-wht">Tax your employer deducts a month</FieldLabel>
            <RupeeInput id="tax-monthly-wht" value={monthlyTax} onChange={setMonthlyTax} />
            <FieldDescription>From your payslip, if they deduct it.</FieldDescription>
          </Field>
        </div>
      )}

      <dl className="flex flex-col gap-1.5 text-sm">
        <Row label="Salary received so far (gross)" value={formatCurrency(data.salaryToDate)} testId="tax-salary-to-date" />
        {left > 0 && <Row label={`Expected for the rest of the year (${left} × ${formatCurrency(Number(monthly || 0))})`} value={formatCurrency(projected)} />}
        {r.zakatDeduction > 0 && <Row label="Zakat paid (deductible, s.60)" value={`−${formatCurrency(r.zakatDeduction)}`} />}
        <Row label="Taxable income" value={formatCurrency(r.taxable)} strong testId="tax-taxable" />
        <Row label="Tax from the slab table" value={formatCurrency(r.normal)} />
        {r.surcharge > 0 && <Row label={`Surcharge (${pct(data.rules.surcharge?.rate ?? 0)})`} value={formatCurrency(r.surcharge)} />}
        {r.donationCredit > 0 && <Row label="Donation tax credit (s.61)" value={`−${formatCurrency(r.donationCredit)}`} />}
        {r.pensionCredit > 0 && <Row label="Pension / VPS tax credit (s.63)" value={`−${formatCurrency(r.pensionCredit)}`} />}
        <Row label="Tax for the year" value={formatCurrency(r.tax)} strong />
        <Row label="Deducted by employer so far" value={`−${formatCurrency(data.employerTaxToDate)}`} />
        {projectedTax > 0 && <Row label="Employer will deduct for the rest of the year" value={`−${formatCurrency(projectedTax)}`} />}
        {data.otherAdjustable > 0 && <Row label="Other tax deducted (adjustable)" value={`−${formatCurrency(data.otherAdjustable)}`} />}
        <Row label={owe ? "Still to pay" : "Refund due"} value={formatCurrency(Math.abs(r.balance))} strong />
        {data.finalTax > 0 && <Row label="Final tax already paid (not adjustable)" value={formatCurrency(data.finalTax)} muted />}
      </dl>

      <SalaryMonths data={data} />

      <p className="text-xs text-muted-foreground">
        An estimate for salaried income using {taxYearLabel(data.rules.taxYear, true)} rates
        {!data.confirmed && <span className="font-medium text-warning"> (rates for {taxYearLabel(data.taxYear, true)} not confirmed yet)</span>}. Confirm
        with a tax adviser before filing. Sources:{" "}
        {data.rules.sources.map((s, i) => (
          <span key={s.url}>
            {i > 0 && ", "}
            <a href={s.url} target="_blank" rel="noreferrer" className="underline underline-offset-2">
              {s.label}
            </a>
          </span>
        ))}
        , checked {formatExpenseDate(data.rules.checked)}.
      </p>
    </Card>
  );
}

function SalaryMonths({ data }: { data: TaxYearData }) {
  if (!data.salaryByMonth.some((m) => m.recorded)) {
    return (
      <p className="rounded-md bg-muted/50 px-3 py-2 text-sm text-muted-foreground">
        No salary recorded in this tax year yet. Add your salary on the Income page with type Salary, and the tax your employer deducted.
      </p>
    );
  }
  return (
    <details className="text-sm">
      <summary className="cursor-pointer text-muted-foreground">Salary by month</summary>
      <ul className="mt-2 grid grid-cols-2 gap-x-6 gap-y-1 sm:grid-cols-3" aria-label="Salary by month">
        {data.salaryByMonth.map((m, i) => (
          <li key={i} className="flex justify-between gap-2">
            <span className="text-muted-foreground">{taxYearMonthLabel(data.taxYear, i)}</span>
            <span className="tabular-nums">{m.recorded ? formatCurrency(m.gross) : "—"}</span>
          </li>
        ))}
      </ul>
    </details>
  );
}

/* --------------------------------------------------------------- withholding */

function WithholdingForm({ entry, onDone }: { entry?: WithholdingDTO; onDone: () => void }) {
  const [type, setType] = useState<WithholdingTypeValue>(entry?.type ?? "CASH_WITHDRAWAL");
  const [section, setSection] = useState(entry?.section ?? WITHHOLDING_TYPES.CASH_WITHDRAWAL.section);
  const [adjustable, setAdjustable] = useState(entry?.adjustable ?? true);
  const [amount, setAmount] = useState(entry ? String(entry.amount) : "");
  const [date, setDate] = useState(entry?.date ?? todayInput());
  const [note, setNote] = useState(entry?.note ?? "");
  const { errors, clear, isPending, submit } = useSubmit();
  const values = { type, section, adjustable, amount, date, note };

  return (
    <form
      noValidate
      className="flex flex-col gap-5"
      onSubmit={(e) => {
        e.preventDefault();
        submit(() => (entry ? updateWithholding(entry.id, values) : createWithholding(values)), onDone);
      }}
    >
      <FieldGroup className="gap-4">
        <Field>
          <FieldLabel htmlFor="wht-type">Deducted on</FieldLabel>
          <Select
            value={type}
            onValueChange={(v) => {
              const t = v as WithholdingTypeValue;
              setType(t);
              setSection(WITHHOLDING_TYPES[t].section);
              setAdjustable(WITHHOLDING_TYPES[t].adjustable);
            }}
          >
            <SelectTrigger id="wht-type" className="w-full">
              <SelectValue />
            </SelectTrigger>
            <SelectContent>
              {WITHHOLDING_TYPE_KEYS.filter((t) => t !== "SALARY").map((t) => (
                <SelectItem key={t} value={t}>
                  {WITHHOLDING_TYPES[t].label}
                </SelectItem>
              ))}
            </SelectContent>
          </Select>
        </Field>
        <div className="grid gap-4 sm:grid-cols-2">
          <Field data-invalid={Boolean(errors.amount)}>
            <FieldLabel htmlFor="wht-amount">Tax amount</FieldLabel>
            <RupeeInput
              id="wht-amount"
              value={amount}
              onChange={(v) => {
                setAmount(v);
                clear("amount");
              }}
              invalid={Boolean(errors.amount)}
            />
            {errors.amount && <FieldError>{errors.amount}</FieldError>}
          </Field>
          <Field data-invalid={Boolean(errors.date)}>
            <FieldLabel htmlFor="wht-date">Date</FieldLabel>
            <Input
              id="wht-date"
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
        </div>
        <div className="grid gap-4 sm:grid-cols-2">
          <Field>
            <FieldLabel htmlFor="wht-section">
              Section <span className="font-normal text-muted-foreground">(optional)</span>
            </FieldLabel>
            <Input id="wht-section" maxLength={30} value={section} onChange={(e) => setSection(e.target.value)} />
          </Field>
          <Field orientation="horizontal" className="items-center self-end pb-2">
            <Switch id="wht-adjustable" checked={adjustable} onCheckedChange={setAdjustable} />
            <FieldLabel htmlFor="wht-adjustable" className="font-normal">
              Counts against my tax (adjustable)
            </FieldLabel>
          </Field>
        </div>
        <Field>
          <FieldLabel htmlFor="wht-note">
            Note <span className="font-normal text-muted-foreground">(optional)</span>
          </FieldLabel>
          <Input id="wht-note" maxLength={200} placeholder="e.g. Meezan Bank certificate" value={note} onChange={(e) => setNote(e.target.value)} />
        </Field>
      </FieldGroup>
      <DialogFooter>
        <Button type="button" variant="ghost" onClick={onDone} disabled={isPending}>
          Cancel
        </Button>
        <Button type="submit" disabled={isPending}>
          {isPending && <Loader2 className="animate-spin" />}
          {entry ? "Save changes" : "Add"}
        </Button>
      </DialogFooter>
    </form>
  );
}

function WithholdingDialog({ open, onOpenChange, entry }: { open: boolean; onOpenChange: (o: boolean) => void; entry?: WithholdingDTO }) {
  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-h-[92dvh] overflow-y-auto sm:max-w-md">
        <DialogHeader>
          <DialogTitle>{entry ? "Edit tax deducted" : "Add tax deducted"}</DialogTitle>
          <DialogDescription>Tax taken at source, e.g. on a cash withdrawal or phone bill. Find it on your bank or tax certificate.</DialogDescription>
        </DialogHeader>
        {open && <WithholdingForm entry={entry} onDone={() => onOpenChange(false)} />}
      </DialogContent>
    </Dialog>
  );
}

function WithholdingRow({ w }: { w: WithholdingDTO }) {
  const [editing, setEditing] = useState(false);
  const { isPending, run } = useRun();
  return (
    <li className="flex items-center gap-3 py-2.5 text-sm">
      <div className="min-w-0 flex-1">
        <p className="truncate font-medium">{WITHHOLDING_TYPES[w.type].label}</p>
        <p className="truncate text-xs text-muted-foreground">
          {[formatExpenseDate(w.date), w.section ? `s.${w.section}` : null, w.income ? `From ${w.income.source}` : null, w.note]
            .filter(Boolean)
            .join(" · ")}
        </p>
      </div>
      {!w.adjustable && (
        <Badge variant="secondary" className="shrink-0">
          Final
        </Badge>
      )}
      <span className="shrink-0 font-medium tabular-nums">{formatCurrency(w.amount)}</span>
      {w.income ? (
        <span className="size-7 shrink-0" aria-hidden />
      ) : (
        <DropdownMenu>
          <DropdownMenuTrigger asChild>
            <Button variant="ghost" size="icon-sm" aria-label={`Options for ${WITHHOLDING_TYPES[w.type].label} on ${w.date}`} disabled={isPending}>
              {isPending ? <Loader2 className="animate-spin" /> : <MoreVertical />}
            </Button>
          </DropdownMenuTrigger>
          <DropdownMenuContent align="end">
            <DropdownMenuItem onSelect={() => setEditing(true)}>
              <Pencil />
              Edit
            </DropdownMenuItem>
            <DropdownMenuItem variant="destructive" onSelect={() => run(() => deleteWithholding(w.id))}>
              <Trash2 />
              Delete
            </DropdownMenuItem>
          </DropdownMenuContent>
        </DropdownMenu>
      )}
      <WithholdingDialog open={editing} onOpenChange={setEditing} entry={w} />
    </li>
  );
}

export function WithholdingCard({ data }: { data: TaxYearData }) {
  const [adding, setAdding] = useState(false);
  const total = data.withholdings.reduce((a, w) => a + w.amount, 0);
  return (
    <Card className="gap-3">
      <CardHeader>
        <CardTitle>Tax already deducted</CardTitle>
        <CardDescription>
          {formatCurrency(total)} in {taxYearLabel(data.taxYear, true)}. Salary tax comes from your salary entries.
        </CardDescription>
        <CardAction>
          <Button size="sm" variant="outline" onClick={() => setAdding(true)}>
            <Plus />
            Add
          </Button>
        </CardAction>
      </CardHeader>
      <CardContent>
        {data.withholdings.length === 0 ? (
          <p className="py-3 text-sm text-muted-foreground">Nothing yet. Banks and phone companies send yearly tax certificates you can copy from.</p>
        ) : (
          <ul className="flex flex-col divide-y" aria-label="Tax deducted">
            {data.withholdings.map((w) => (
              <WithholdingRow key={w.id} w={w} />
            ))}
          </ul>
        )}
      </CardContent>
      <WithholdingDialog open={adding} onOpenChange={setAdding} />
    </Card>
  );
}

/* ---------------------------------------------------------------- deductions */

function TagSelect({ category }: { category: TaxYearData["categories"][number] }) {
  const { isPending, run } = useRun();
  return (
    <Select value={category.taxTag ?? "NONE"} disabled={isPending} onValueChange={(v) => run(() => setCategoryTaxTag(category.id, v === "NONE" ? "" : v))}>
      <SelectTrigger className="w-full sm:w-64" aria-label={`Tax treatment of ${category.name}`}>
        <SelectValue />
      </SelectTrigger>
      <SelectContent>
        <SelectItem value="NONE">Not tax related</SelectItem>
        {TAX_TAG_KEYS.map((t) => (
          <SelectItem key={t} value={t}>
            {TAX_TAGS[t].label}
          </SelectItem>
        ))}
      </SelectContent>
    </Select>
  );
}

function DeductionToggle({ id, excluded, label }: { id: string; excluded: boolean; label: string }) {
  const { isPending, run } = useRun();
  return (
    <Checkbox
      checked={!excluded}
      disabled={isPending}
      aria-label={`Count ${label} in my tax`}
      onCheckedChange={(v) => run(() => setExpenseTaxExcluded(id, v !== true))}
    />
  );
}

export function DeductionsCard({ data }: { data: TaxYearData }) {
  const [showCats, setShowCats] = useState(false);
  const rows = TAX_TAG_KEYS.flatMap((t) => data.deductions[t].map((d) => ({ ...d, tag: t })));
  const active = data.categories.filter((c) => !c.archived || c.taxTag);
  return (
    <Card className="gap-3">
      <CardHeader>
        <CardTitle>Deductions & credits</CardTitle>
        <CardDescription>Zakat lowers your taxable income; donations and pension contributions give a tax credit.</CardDescription>
        <CardAction>
          <Button size="sm" variant="outline" onClick={() => setShowCats((s) => !s)} aria-expanded={showCats}>
            Categories
          </Button>
        </CardAction>
      </CardHeader>
      <CardContent className="flex flex-col gap-4">
        {showCats && (
          <ul className="flex flex-col gap-2 rounded-lg bg-muted/50 p-3" aria-label="Category tax treatment">
            {active.map((c) => (
              <li key={c.id} className="flex flex-col gap-1 sm:flex-row sm:items-center sm:justify-between">
                <span className="text-sm font-medium">{c.name}</span>
                <TagSelect category={c} />
              </li>
            ))}
          </ul>
        )}
        {rows.length === 0 ? (
          <p className="text-sm text-muted-foreground">
            No tax-related expenses in {taxYearLabel(data.taxYear, true)}. Use <span className="font-medium">Categories</span> to mark which
            categories count, e.g. Charity as donations.
          </p>
        ) : (
          <ul className="flex flex-col divide-y" aria-label="Deductible expenses">
            {rows.map((d) => (
              <li key={d.id} className={cn("flex items-center gap-3 py-2 text-sm", d.excluded && "opacity-60")}>
                <DeductionToggle id={d.id} excluded={d.excluded} label={d.description} />
                <div className="min-w-0 flex-1">
                  <p className="truncate font-medium">{d.description}</p>
                  <p className="truncate text-xs text-muted-foreground">
                    {formatExpenseDate(d.date)} · {TAX_TAGS[d.tag].label}
                  </p>
                </div>
                <span className="shrink-0 font-medium tabular-nums">{formatCurrency(d.amount)}</span>
              </li>
            ))}
          </ul>
        )}
        <p className="text-xs text-muted-foreground">
          Untick anything you can&apos;t prove with a receipt, or a donation to an institution that isn&apos;t FBR-approved.
        </p>
      </CardContent>
    </Card>
  );
}

/* ----------------------------------------------------------------- deadlines */

function ReminderForm({ deadline, onDone }: { deadline?: DeadlineDTO; onDone: () => void }) {
  const [title, setTitle] = useState(deadline?.title ?? "");
  const [date, setDate] = useState(deadline?.date ?? todayInput());
  const [yearly, setYearly] = useState(deadline?.yearly ?? true);
  const [notes, setNotes] = useState(deadline?.notes ?? "");
  const { errors, clear, isPending, submit } = useSubmit();
  const values = { title, date, yearly, notes };
  return (
    <form
      noValidate
      className="flex flex-col gap-5"
      onSubmit={(e) => {
        e.preventDefault();
        submit(() => (deadline?.reminderId ? updateReminder(deadline.reminderId, values) : createReminder(values)), onDone);
      }}
    >
      <FieldGroup className="gap-4">
        <Field data-invalid={Boolean(errors.title)}>
          <FieldLabel htmlFor="rem-title">What</FieldLabel>
          <Input
            id="rem-title"
            maxLength={80}
            placeholder="e.g. Car token tax"
            value={title}
            onChange={(e) => {
              setTitle(e.target.value);
              clear("title");
            }}
            aria-invalid={Boolean(errors.title)}
            autoFocus
          />
          {errors.title && <FieldError>{errors.title}</FieldError>}
        </Field>
        <div className="grid gap-4 sm:grid-cols-2">
          <Field data-invalid={Boolean(errors.date)}>
            <FieldLabel htmlFor="rem-date">Date</FieldLabel>
            <Input
              id="rem-date"
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
          <Field orientation="horizontal" className="items-center self-end pb-2">
            <Switch id="rem-yearly" checked={yearly} onCheckedChange={setYearly} />
            <FieldLabel htmlFor="rem-yearly" className="font-normal">
              Every year
            </FieldLabel>
          </Field>
        </div>
        <Field>
          <FieldLabel htmlFor="rem-notes">
            Notes <span className="font-normal text-muted-foreground">(optional)</span>
          </FieldLabel>
          <Input id="rem-notes" maxLength={300} value={notes} onChange={(e) => setNotes(e.target.value)} />
        </Field>
      </FieldGroup>
      <DialogFooter>
        <Button type="button" variant="ghost" onClick={onDone} disabled={isPending}>
          Cancel
        </Button>
        <Button type="submit" disabled={isPending}>
          {isPending && <Loader2 className="animate-spin" />}
          {deadline ? "Save changes" : "Add reminder"}
        </Button>
      </DialogFooter>
    </form>
  );
}

function ReminderDialog({ open, onOpenChange, deadline }: { open: boolean; onOpenChange: (o: boolean) => void; deadline?: DeadlineDTO }) {
  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="sm:max-w-md">
        <DialogHeader>
          <DialogTitle>{deadline ? "Edit reminder" : "Add a reminder"}</DialogTitle>
          <DialogDescription>Shown on your dashboard a month before, and emailed 14 and 3 days before.</DialogDescription>
        </DialogHeader>
        {open && <ReminderForm deadline={deadline} onDone={() => onOpenChange(false)} />}
      </DialogContent>
    </Dialog>
  );
}

export function dueText(days: number) {
  if (days < 0) return `${-days} day${days === -1 ? "" : "s"} ago`;
  if (days === 0) return "Today";
  if (days === 1) return "Tomorrow";
  return `In ${days} days`;
}

function DeadlineRow({ d }: { d: DeadlineDTO }) {
  const [editing, setEditing] = useState(false);
  const [deleting, setDeleting] = useState(false);
  const { isPending, run } = useRun();
  return (
    <li className="flex items-center gap-3 py-2.5 text-sm">
      <span
        className={cn(
          "flex size-8 shrink-0 items-center justify-center rounded-lg",
          d.kind === "tax" ? "bg-primary/10 text-primary" : "bg-muted text-muted-foreground",
        )}
        aria-hidden
      >
        {d.kind === "tax" ? <CalendarClock className="size-4" /> : <Bell className="size-4" />}
      </span>
      <div className="min-w-0 flex-1">
        <p className="truncate font-medium">{d.title}</p>
        <p className="truncate text-xs text-muted-foreground">
          {formatExpenseDate(d.date)} · {d.kind === "tax" ? "Check FBR for extensions" : d.detail}
        </p>
      </div>
      <Badge variant="secondary" className={cn("shrink-0 border-0", d.daysUntil <= 14 && "bg-warning/15 text-warning")}>
        {dueText(d.daysUntil)}
      </Badge>
      {d.reminderId ? (
        <DropdownMenu>
          <DropdownMenuTrigger asChild>
            <Button variant="ghost" size="icon-sm" aria-label={`Options for ${d.title}`} disabled={isPending}>
              {isPending ? <Loader2 className="animate-spin" /> : <MoreVertical />}
            </Button>
          </DropdownMenuTrigger>
          <DropdownMenuContent align="end">
            <DropdownMenuItem onSelect={() => setEditing(true)}>
              <Pencil />
              Edit
            </DropdownMenuItem>
            <DropdownMenuItem variant="destructive" onSelect={() => setDeleting(true)}>
              <Trash2 />
              Delete
            </DropdownMenuItem>
          </DropdownMenuContent>
        </DropdownMenu>
      ) : (
        <span className="size-7 shrink-0" aria-hidden />
      )}
      <ReminderDialog open={editing} onOpenChange={setEditing} deadline={d} />
      <AlertDialog open={deleting} onOpenChange={(o) => !isPending && setDeleting(o)}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>Delete &ldquo;{d.title}&rdquo;?</AlertDialogTitle>
            <AlertDialogDescription>You won&apos;t be reminded about it any more.</AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel disabled={isPending}>Cancel</AlertDialogCancel>
            <AlertDialogAction
              variant="destructive"
              disabled={isPending}
              onClick={(e) => {
                e.preventDefault();
                run(() => deleteReminder(d.reminderId!), () => setDeleting(false));
              }}
            >
              Delete
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </li>
  );
}

export function DeadlinesCard({ deadlines, compact = false }: { deadlines: DeadlineDTO[]; compact?: boolean }) {
  const [adding, setAdding] = useState(false);
  return (
    <Card className="gap-3" data-testid="deadlines">
      <CardHeader>
        <CardTitle>{compact ? "Coming up" : "Deadlines & reminders"}</CardTitle>
        <CardDescription>{compact ? "Tax dates and your reminders in the next 30 days" : "Tax filing dates and your own reminders"}</CardDescription>
        {!compact && (
          <CardAction>
            <Button size="sm" variant="outline" onClick={() => setAdding(true)}>
              <Plus />
              Add reminder
            </Button>
          </CardAction>
        )}
      </CardHeader>
      <CardContent>
        <ul className="flex flex-col divide-y" aria-label="Deadlines">
          {deadlines.map((d) => (
            <DeadlineRow key={d.key} d={d} />
          ))}
        </ul>
      </CardContent>
      <ReminderDialog open={adding} onOpenChange={setAdding} />
    </Card>
  );
}
