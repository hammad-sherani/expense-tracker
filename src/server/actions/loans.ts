"use server";

import { requireUser } from "@/lib/auth/dal";
import { db } from "@/lib/db";
import { dateInputToUTC } from "@/lib/dates";
import { formatCurrency, roundMoney } from "@/lib/format";
import { loanState } from "@/lib/loans";
import { toPaisa } from "@/lib/split";
import { type LoanPayValues, loanPaySchema, type LoanValues, loanSchema } from "@/lib/validations/loan";
import { objectId } from "@/lib/validations/money";
import { revalidateAll } from "@/server/revalidate";
import type { ActionResult } from "@/types";

/** A problem the user can fix; `field` ties it to a form input. */
class LoanError extends Error {
  constructor(
    message: string,
    public field?: string,
  ) {
    super(message);
  }
}

const invalid = (e: import("zod").ZodError): ActionResult<never> => ({
  ok: false,
  error: "Please fix the highlighted fields.",
  fieldErrors: e.flatten().fieldErrors as Record<string, string[] | undefined>,
});

function failure(e: unknown, fallback: string): ActionResult<never> {
  if (e instanceof LoanError) {
    return { ok: false, error: e.message, ...(e.field ? { fieldErrors: { [e.field]: [e.message] } } : {}) };
  }
  console.error(fallback, e);
  return { ok: false, error: fallback };
}

const badId: ActionResult<never> = { ok: false, error: "Invalid loan." };
const INTEREST_CATEGORY = "Loan interest";

type Tx = Parameters<Parameters<typeof db.$transaction>[0]>[0];

async function assertWallet(userId: string, walletId: string, field: string) {
  if (!walletId) return null;
  const w = await db.wallet.findFirst({ where: { id: walletId, userId }, select: { id: true } });
  if (!w) throw new LoanError("This wallet no longer exists.", field);
  return w.id;
}

async function ownLoan(userId: string, id: string) {
  const loan = await db.loan.findFirst({
    where: { id, userId },
    include: { payments: { orderBy: [{ date: "asc" }, { createdAt: "asc" }] } },
  });
  if (!loan) throw new LoanError("This loan no longer exists.");
  return loan;
}

/** The "Loan interest" category, created the first time it's needed (or brought back if archived). */
async function interestCategory(tx: Tx, userId: string) {
  const nameKey = INTEREST_CATEGORY.toLowerCase();
  const found = await tx.category.findFirst({ where: { userId, nameKey } });
  if (found) {
    if (found.archivedAt) await tx.category.update({ where: { id: found.id }, data: { archivedAt: null } });
    return found.id;
  }
  const last = await tx.category.findFirst({ where: { userId }, orderBy: { sortOrder: "desc" } });
  const created = await tx.category.create({
    data: { userId, name: INTEREST_CATEGORY, nameKey, icon: "bank", color: "#64748b", sortOrder: (last?.sortOrder ?? -1) + 1 },
  });
  return created.id;
}

function loanData(v: LoanValues) {
  return {
    name: v.name,
    lender: v.lender || null,
    principal: roundMoney(Number(v.principal)),
    annualRatePct: Number(v.annualRatePct || 0),
    monthlyInstallment: roundMoney(Number(v.monthlyInstallment)),
    startDate: dateInputToUTC(v.startDate),
    alreadyRepaid: roundMoney(Number(v.alreadyRepaid || 0)),
    notes: v.notes || null,
  };
}

export async function createLoan(input: LoanValues): Promise<ActionResult<{ id: string }>> {
  const parsed = loanSchema.safeParse(input);
  if (!parsed.success) return invalid(parsed.error);
  const user = await requireUser();
  try {
    const receivedWalletId = await assertWallet(user.id, parsed.data.receivedWalletId, "receivedWalletId");
    const loan = await db.loan.create({ data: { userId: user.id, ...loanData(parsed.data), receivedWalletId } });
    revalidateAll();
    return { ok: true, data: { id: loan.id }, message: `${loan.name} added` };
  } catch (e) {
    return failure(e, "Couldn't add this loan.");
  }
}

export async function updateLoan(id: string, input: LoanValues): Promise<ActionResult> {
  if (!objectId.safeParse(id).success) return badId;
  const parsed = loanSchema.safeParse(input);
  if (!parsed.success) return invalid(parsed.error);
  const user = await requireUser();
  try {
    const loan = await ownLoan(user.id, id);
    const data = loanData(parsed.data);
    if (loan.payments.length > 0 && data.startDate.getTime() !== loan.startDate.getTime()) {
      throw new LoanError("The first installment date can't change once payments are recorded.", "startDate");
    }
    const paid = loan.payments.reduce((a, p) => a + p.principalPart, 0);
    if (toPaisa(data.alreadyRepaid + paid) > toPaisa(data.principal)) {
      throw new LoanError(`You've already repaid ${formatCurrency(data.alreadyRepaid + paid)}.`, "principal");
    }
    const receivedWalletId = await assertWallet(user.id, parsed.data.receivedWalletId, "receivedWalletId");
    await db.loan.update({ where: { id: loan.id }, data: { ...data, receivedWalletId } });
    revalidateAll();
    return { ok: true, data: undefined, message: "Loan updated" };
  } catch (e) {
    return failure(e, "Couldn't update this loan.");
  }
}

/**
 * Records a payment. The interest part becomes an expense ("Loan interest") paid from the
 * wallet; the rest repays the loan, leaving the wallet without counting as spending.
 */
export async function payLoan(id: string, input: LoanPayValues): Promise<ActionResult> {
  if (!objectId.safeParse(id).success) return badId;
  const parsed = loanPaySchema.safeParse(input);
  if (!parsed.success) return invalid(parsed.error);
  const user = await requireUser();
  const v = parsed.data;
  const amount = roundMoney(Number(v.amount));
  const interestPart = roundMoney(Number(v.interest || 0));
  const principalPart = roundMoney(amount - interestPart);
  const date = dateInputToUTC(v.date);
  try {
    const loan = await ownLoan(user.id, id);
    const walletId = await assertWallet(user.id, v.walletId, "walletId");
    const { balance } = loanState(loan);
    if (balance <= 0) throw new LoanError("This loan is already paid off.");
    if (toPaisa(principalPart) > toPaisa(balance)) {
      throw new LoanError(`Only ${formatCurrency(balance)} of the loan is left, plus interest.`, "amount");
    }
    await db.$transaction(async (tx) => {
      const expense =
        interestPart > 0
          ? await tx.expense.create({
              data: {
                userId: user.id,
                amount: interestPart,
                description: `Interest: ${loan.name}`,
                date,
                categoryId: await interestCategory(tx, user.id),
                walletId,
              },
            })
          : null;
      await tx.loanPayment.create({
        data: { userId: user.id, loanId: loan.id, date, amount, principalPart, interestPart, walletId, expenseId: expense?.id ?? null },
      });
    });
    revalidateAll();
    const left = roundMoney(balance - principalPart);
    return {
      ok: true,
      data: undefined,
      message: left > 0 ? `Paid ${formatCurrency(amount)}. ${formatCurrency(left)} left` : `${loan.name} is paid off`,
    };
  } catch (e) {
    return failure(e, "Couldn't record this payment.");
  }
}

/** Removes the latest payment and its interest expense. */
export async function undoLoanPayment(id: string): Promise<ActionResult> {
  if (!objectId.safeParse(id).success) return badId;
  const user = await requireUser();
  try {
    const loan = await ownLoan(user.id, id);
    const last = loan.payments.at(-1);
    if (!last) throw new LoanError("There's nothing to undo.");
    await db.$transaction(async (tx) => {
      await tx.loanPayment.delete({ where: { id: last.id } });
      if (last.expenseId) await tx.expense.deleteMany({ where: { id: last.expenseId, userId: user.id } });
    });
    revalidateAll();
    return { ok: true, data: undefined, message: `Payment of ${formatCurrency(last.amount)} removed` };
  } catch (e) {
    return failure(e, "Couldn't undo this payment.");
  }
}

/** Only paid-off loans can be archived, so nothing still due disappears. */
export async function setLoanArchived(id: string, archived: boolean): Promise<ActionResult> {
  if (!objectId.safeParse(id).success) return badId;
  const user = await requireUser();
  try {
    const loan = await ownLoan(user.id, id);
    if (archived && !loanState(loan).finished) throw new LoanError("Pay off the loan before archiving it.");
    await db.loan.update({ where: { id: loan.id }, data: { archivedAt: archived ? new Date() : null } });
    revalidateAll();
    return { ok: true, data: undefined, message: archived ? "Loan archived" : "Loan restored" };
  } catch (e) {
    return failure(e, "Couldn't update this loan.");
  }
}

/** Removes the loan, its payments and their interest expenses, as if it never happened. */
export async function deleteLoan(id: string): Promise<ActionResult> {
  if (!objectId.safeParse(id).success) return badId;
  const user = await requireUser();
  try {
    const loan = await ownLoan(user.id, id);
    const expenseIds = loan.payments.flatMap((p) => (p.expenseId ? [p.expenseId] : []));
    await db.$transaction(async (tx) => {
      await tx.loanPayment.deleteMany({ where: { loanId: loan.id, userId: user.id } });
      if (expenseIds.length) await tx.expense.deleteMany({ where: { id: { in: expenseIds }, userId: user.id } });
      await tx.loan.delete({ where: { id: loan.id } });
    });
    revalidateAll();
    return { ok: true, data: undefined, message: "Loan deleted" };
  } catch (e) {
    return failure(e, "Couldn't delete this loan.");
  }
}
