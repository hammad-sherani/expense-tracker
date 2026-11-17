/** Loan maths (reducing balance). Pure, so it runs on the server, in the browser and in tests. */
import { occurrence } from "./recurrence";

export type LoanLike = {
  principal: number;
  annualRatePct: number;
  monthlyInstallment: number;
  startDate: Date;
  alreadyRepaid: number;
  payments: { principalPart: number }[];
};

const money = (n: number) => Math.round((n + Number.EPSILON) * 100) / 100;
const MAX_MONTHS = 600;

/** One month's interest on what's still owed. */
export function monthlyInterest(balance: number, annualRatePct: number) {
  return money((Math.max(0, balance) * annualRatePct) / 100 / 12);
}

/** Due date of installment `n` (1 = first). */
export function loanDueDate(startDate: Date, n: number) {
  return occurrence(startDate, "MONTHLY", 1, n - 1);
}

/** The usual next payment: one installment (or what's left), split into interest and repayment. */
export function suggestedPayment(balance: number, annualRatePct: number, installment: number) {
  const interest = monthlyInterest(balance, annualRatePct);
  const amount = money(Math.min(installment, balance + interest));
  return { amount, interest: Math.min(interest, amount), principal: money(amount - Math.min(interest, amount)) };
}

/** Months until paid off at the current installment; null when the installment doesn't cover the interest. */
export function monthsToPayOff(balance: number, annualRatePct: number, installment: number) {
  let left = money(balance);
  let months = 0;
  while (left > 0.004) {
    const interest = monthlyInterest(left, annualRatePct);
    if (installment <= interest) return null;
    left = money(left + interest - installment);
    if (++months > MAX_MONTHS) return null;
  }
  return months;
}

/** Installments still to pay that fall before `until`, each split into interest and repayment. */
export function upcomingInstallments(l: LoanLike, until: Date, max = 600) {
  const out: { n: number; date: Date; amount: number; interest: number; principal: number }[] = [];
  let { balance } = loanState(l);
  for (let n = l.payments.length + 1; balance > 0.004 && out.length < max; n++) {
    const date = loanDueDate(l.startDate, n);
    if (date >= until) break;
    const p = suggestedPayment(balance, l.annualRatePct, l.monthlyInstallment);
    if (p.principal <= 0) {
      // The installment doesn't cover the interest: show it anyway, the balance won't fall.
      out.push({ n, date, ...p });
      continue;
    }
    out.push({ n, date, ...p });
    balance = money(balance - p.principal);
  }
  return out;
}

export function loanState(l: LoanLike) {
  const repaid = money(l.alreadyRepaid + l.payments.reduce((a, p) => a + p.principalPart, 0));
  const balance = money(Math.max(0, l.principal - repaid));
  const finished = balance <= 0;
  const paidCount = l.payments.length;
  const months = finished ? 0 : monthsToPayOff(balance, l.annualRatePct, l.monthlyInstallment);
  return {
    balance,
    repaid,
    percent: l.principal > 0 ? Math.min(100, (repaid / l.principal) * 100) : 100,
    finished,
    paidCount,
    nextDate: finished ? null : loanDueDate(l.startDate, paidCount + 1),
    next: finished ? null : suggestedPayment(balance, l.annualRatePct, l.monthlyInstallment),
    monthsLeft: months,
    payoffDate: months === null || finished ? null : loanDueDate(l.startDate, paidCount + months),
  };
}
