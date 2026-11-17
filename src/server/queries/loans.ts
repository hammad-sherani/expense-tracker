import "server-only";
import { db } from "@/lib/db";
import { diffInDays, toDateInput, todayUTC } from "@/lib/dates";
import { loanState } from "@/lib/loans";
import { UPCOMING_DAYS } from "@/server/queries/recurring";

export type LoanStatus = "overdue" | "today" | "soon" | "later" | "done";

export type LoanPaymentDTO = {
  id: string;
  date: string;
  amount: number;
  principalPart: number;
  interestPart: number;
  wallet: { id: string; name: string } | null;
};

export type LoanDTO = {
  id: string;
  name: string;
  lender: string | null;
  principal: number;
  annualRatePct: number;
  monthlyInstallment: number;
  startDate: string;
  receivedWallet: { id: string; name: string } | null;
  alreadyRepaid: number;
  notes: string | null;
  archived: boolean;
  balance: number;
  repaid: number;
  percent: number;
  finished: boolean;
  interestPaid: number;
  nextDate: string | null;
  /** Days until the next installment (negative = overdue). */
  daysUntil: number | null;
  status: LoanStatus;
  /** Suggested next payment, split into interest and repayment. */
  next: { amount: number; interest: number; principal: number } | null;
  /** null = the installment doesn't cover the interest. */
  monthsLeft: number | null;
  payoffDate: string | null;
  /** Newest first. */
  payments: LoanPaymentDTO[];
};

export async function listLoans(userId: string): Promise<LoanDTO[]> {
  const today = todayUTC();
  const rows = await db.loan.findMany({
    where: { userId },
    orderBy: { createdAt: "asc" },
    include: {
      receivedWallet: { select: { id: true, name: true } },
      payments: { orderBy: [{ date: "asc" }, { createdAt: "asc" }], include: { wallet: { select: { id: true, name: true } } } },
    },
  });
  const rank = (l: LoanDTO) => (l.archived ? 2 : l.finished ? 1 : 0);
  return rows
    .map((l): LoanDTO => {
      const s = loanState(l);
      const daysUntil = s.nextDate ? diffInDays(today, s.nextDate) : null;
      const status: LoanStatus =
        daysUntil === null ? "done" : daysUntil < 0 ? "overdue" : daysUntil === 0 ? "today" : daysUntil <= UPCOMING_DAYS ? "soon" : "later";
      return {
        id: l.id,
        name: l.name,
        lender: l.lender,
        principal: l.principal,
        annualRatePct: l.annualRatePct,
        monthlyInstallment: l.monthlyInstallment,
        startDate: toDateInput(l.startDate),
        receivedWallet: l.receivedWallet,
        alreadyRepaid: l.alreadyRepaid,
        notes: l.notes,
        archived: Boolean(l.archivedAt),
        balance: s.balance,
        repaid: s.repaid,
        percent: s.percent,
        finished: s.finished,
        interestPaid: Math.round(l.payments.reduce((a, p) => a + p.interestPart, 0) * 100) / 100,
        nextDate: s.nextDate ? toDateInput(s.nextDate) : null,
        daysUntil,
        status,
        next: s.next,
        monthsLeft: s.monthsLeft,
        payoffDate: s.payoffDate ? toDateInput(s.payoffDate) : null,
        payments: l.payments
          .map((p) => ({
            id: p.id,
            date: toDateInput(p.date),
            amount: p.amount,
            principalPart: p.principalPart,
            interestPart: p.interestPart,
            wallet: p.wallet,
          }))
          .reverse(),
      };
    })
    .sort((a, b) => rank(a) - rank(b) || (a.daysUntil ?? 0) - (b.daysUntil ?? 0));
}

const isOpen = (l: LoanDTO) => !l.archived && l.nextDate !== null;

/** Installments overdue or due within the next week. */
export function upcomingLoans(list: LoanDTO[]) {
  return list.filter((l) => isOpen(l) && l.daysUntil !== null && l.daysUntil <= UPCOMING_DAYS);
}

/** Loans with an installment due today or overdue (sidebar badge). */
export function dueLoanCount(list: LoanDTO[]) {
  return list.filter((l) => isOpen(l) && l.daysUntil !== null && l.daysUntil <= 0).length;
}

/** What's still owed on all active loans. */
export function totalLoanBalance(list: LoanDTO[]) {
  return Math.round(list.filter((l) => !l.archived).reduce((a, l) => a + l.balance, 0) * 100) / 100;
}
