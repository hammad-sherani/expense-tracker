/** Committee (BC) maths. Pure, so it runs on the server, in the browser and in tests. */
import { occurrence } from "./recurrence";

export type CommitteeLike = {
  monthlyAmount: number;
  members: number;
  turn: number;
  startDate: Date;
  payoutAt: Date | null;
  payoutAmount: number | null;
  payments: { amount: number }[];
};

const money = (n: number) => Math.round((n + Number.EPSILON) * 100) / 100;

/** Due date of installment `n` (1 = first). */
export function installmentDate(startDate: Date, n: number) {
  return occurrence(startDate, "MONTHLY", 1, n - 1);
}

export function committeeState(c: CommitteeLike) {
  const paidCount = c.payments.length;
  const paidTotal = money(c.payments.reduce((a, p) => a + p.amount, 0));
  const remaining = Math.max(0, c.members - paidCount);
  const received = c.payoutAt !== null;
  const receivedAmount = received ? (c.payoutAmount ?? 0) : 0;
  return {
    paidCount,
    paidTotal,
    remaining,
    pot: money(c.monthlyAmount * c.members),
    nextInstallment: remaining > 0 ? paidCount + 1 : null,
    nextDate: remaining > 0 ? installmentDate(c.startDate, paidCount + 1) : null,
    payoutExpected: installmentDate(c.startDate, c.turn),
    received,
    /** + money sitting in the committee, − pot received early and still being paid back. */
    position: money(paidTotal - receivedAmount),
    finished: remaining === 0 && received,
  };
}

/** A share held for a friend: what they've given back and what's next to collect. */
export function collectionState(c: CommitteeLike & { collections: { amount: number }[] }) {
  const paidTotal = money(c.payments.reduce((a, p) => a + p.amount, 0));
  const collectedCount = c.collections.length;
  const collectedTotal = money(c.collections.reduce((a, p) => a + p.amount, 0));
  const next = collectedCount < c.members ? collectedCount + 1 : null;
  return {
    collectedCount,
    collectedTotal,
    /** + they owe you for installments you paid, − you're holding money they gave ahead. */
    friendOwes: money(paidTotal - collectedTotal),
    nextCollection: next,
    nextCollectionDate: next ? installmentDate(c.startDate, next) : null,
  };
}
