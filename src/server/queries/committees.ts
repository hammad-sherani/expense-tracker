import "server-only";
import { collectionState, committeeState } from "@/lib/committee";
import { db } from "@/lib/db";
import { diffInDays, toDateInput, todayUTC } from "@/lib/dates";
import { UPCOMING_DAYS } from "@/server/queries/recurring";

export type CommitteeStatus = "overdue" | "today" | "soon" | "later" | "done";

export type CommitteePaymentDTO = {
  id: string;
  installment: number;
  date: string;
  amount: number;
  wallet: { id: string; name: string } | null;
  note: string | null;
};

export type CommitteeDTO = {
  id: string;
  name: string;
  monthlyAmount: number;
  members: number;
  turn: number;
  startDate: string;
  notes: string | null;
  archived: boolean;
  paidCount: number;
  paidTotal: number;
  remaining: number;
  pot: number;
  nextInstallment: number | null;
  nextDate: string | null;
  /** Days until the next installment (negative = overdue). */
  daysUntil: number | null;
  status: CommitteeStatus;
  payoutExpected: string;
  /** The user's turn has arrived and the pot isn't marked received. */
  payoutDue: boolean;
  received: boolean;
  payoutAt: string | null;
  payoutAmount: number | null;
  payoutWallet: { id: string; name: string } | null;
  /** Own share: money in the committee (− = pot received early). A friend's share: what they owe you. */
  position: number;
  finished: boolean;
  /** Set when this share is a friend's: you pay it and collect it back from them. */
  forFriend: { id: string; name: string } | null;
  collectedCount: number;
  collectedTotal: number;
  /** + they owe you for installments you paid, − you're holding money they gave ahead. */
  friendOwes: number;
  /** Next installment to collect from the friend. */
  nextCollection: number | null;
  nextCollectionDate: string | null;
  /** Days until it's due to collect (negative = late). */
  collectDaysUntil: number | null;
  collectStatus: CommitteeStatus;
  /** Newest first. */
  collections: CommitteePaymentDTO[];
  /** Newest first. */
  payments: CommitteePaymentDTO[];
};

const statusOf = (days: number | null): CommitteeStatus =>
  days === null ? "done" : days < 0 ? "overdue" : days === 0 ? "today" : days <= UPCOMING_DAYS ? "soon" : "later";

export async function listCommittees(userId: string): Promise<CommitteeDTO[]> {
  const today = todayUTC();
  const rows = await db.committee.findMany({
    where: { userId },
    orderBy: { createdAt: "asc" },
    include: {
      payoutWallet: { select: { id: true, name: true } },
      forFriend: { select: { id: true, name: true } },
      payments: { orderBy: { installment: "desc" }, include: { wallet: { select: { id: true, name: true } } } },
      collections: { orderBy: { installment: "desc" }, include: { wallet: { select: { id: true, name: true } } } },
    },
  });
  const rank = (c: CommitteeDTO) => (c.archived ? 2 : c.finished ? 1 : 0);
  return rows
    .map((c): CommitteeDTO => {
      const s = committeeState(c);
      const k = collectionState(c);
      const daysUntil = s.nextDate ? diffInDays(today, s.nextDate) : null;
      const status = statusOf(daysUntil);
      const friend = c.forFriend ?? null;
      const collectDaysUntil = friend && k.nextCollectionDate ? diffInDays(today, k.nextCollectionDate) : null;
      return {
        id: c.id,
        name: c.name,
        monthlyAmount: c.monthlyAmount,
        members: c.members,
        turn: c.turn,
        startDate: toDateInput(c.startDate),
        notes: c.notes,
        archived: Boolean(c.archivedAt),
        paidCount: s.paidCount,
        paidTotal: s.paidTotal,
        remaining: s.remaining,
        pot: s.pot,
        nextInstallment: s.nextInstallment,
        nextDate: s.nextDate ? toDateInput(s.nextDate) : null,
        daysUntil,
        status,
        payoutExpected: toDateInput(s.payoutExpected),
        payoutDue: !s.received && s.payoutExpected <= today,
        received: s.received,
        payoutAt: c.payoutAt ? toDateInput(c.payoutAt) : null,
        payoutAmount: c.payoutAmount,
        payoutWallet: c.payoutWallet,
        position: friend ? k.friendOwes : s.position,
        finished: s.finished && (!friend || (k.nextCollection === null && k.friendOwes === 0)),
        forFriend: friend,
        collectedCount: k.collectedCount,
        collectedTotal: k.collectedTotal,
        friendOwes: k.friendOwes,
        nextCollection: friend ? k.nextCollection : null,
        nextCollectionDate: friend && k.nextCollectionDate ? toDateInput(k.nextCollectionDate) : null,
        collectDaysUntil,
        collectStatus: statusOf(collectDaysUntil),
        collections: c.collections.map((p) => ({
          id: p.id,
          installment: p.installment,
          date: toDateInput(p.date),
          amount: p.amount,
          wallet: p.wallet,
          note: null,
        })),
        payments: c.payments.map((p) => ({
          id: p.id,
          installment: p.installment,
          date: toDateInput(p.date),
          amount: p.amount,
          wallet: p.wallet,
          note: p.note,
        })),
      };
    })
    .sort((a, b) => rank(a) - rank(b) || (a.daysUntil ?? 0) - (b.daysUntil ?? 0));
}

const isOpen = (c: CommitteeDTO) => !c.archived && c.nextDate !== null;

/** Installments overdue or due within the next week. */
export function upcomingCommittees(list: CommitteeDTO[]) {
  return list.filter((c) => isOpen(c) && c.daysUntil !== null && c.daysUntil <= UPCOMING_DAYS);
}

/** Friends' shares with money to collect that's late or due within the next week. */
export function upcomingCollections(list: CommitteeDTO[]) {
  return list.filter((c) => !c.archived && c.collectDaysUntil !== null && c.collectDaysUntil <= UPCOMING_DAYS);
}

/** Installments to pay, and friends' shares to collect, due today or overdue (sidebar badge). */
export function dueCommitteeCount(list: CommitteeDTO[]) {
  const pay = list.filter((c) => isOpen(c) && c.daysUntil !== null && c.daysUntil <= 0).length;
  const collect = list.filter((c) => !c.archived && c.collectDaysUntil !== null && c.collectDaysUntil <= 0).length;
  return pay + collect;
}
