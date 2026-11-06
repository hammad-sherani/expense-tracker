/**
 * Bill-splitting math shared by the expense form (live preview) and the server.
 * Works in paisa (integer cents) to avoid floating point drift.
 */

export const toPaisa = (amount: number) => Math.round(amount * 100);
export const fromPaisa = (paisa: number) => paisa / 100;

/**
 * Splits `total` across `count` people. Shares are rounded down to paisa and the
 * leftover paisa go to the first share (me), e.g. 1000 / 3 -> [333.34, 333.33, 333.33].
 */
export function equalSplit(total: number, count: number): number[] {
  if (count <= 0) return [];
  const totalPaisa = toPaisa(total);
  const base = Math.floor(totalPaisa / count);
  const shares = new Array<number>(count).fill(base);
  shares[0] += totalPaisa - base * count;
  return shares.map(fromPaisa);
}

export type SplitInput = {
  total: number;
  myShare: number;
  /** "me" or a friend id. */
  paidBy: string;
  participants: { friendId: string; share: number }[];
};

export type PlannedDue = { friendId: string; direction: "OWED_TO_ME" | "I_OWE"; amount: number };

/**
 * Turns a split into what gets stored:
 * - the expense amount is always my share;
 * - if I paid, every friend owes me their share;
 * - if a friend paid, I owe that friend my share (other people's shares aren't mine to track).
 */
export function planSplit(input: SplitInput) {
  const iPaid = input.paidBy === "me";
  const dues: PlannedDue[] = iPaid
    ? input.participants
        .filter((p) => toPaisa(p.share) > 0)
        .map((p) => ({ friendId: p.friendId, direction: "OWED_TO_ME" as const, amount: p.share }))
    : [{ friendId: input.paidBy, direction: "I_OWE" as const, amount: input.myShare }];

  return {
    expenseAmount: input.myShare,
    splitTotal: input.total,
    paidByFriendId: iPaid ? null : input.paidBy,
    dues,
  };
}

/** Difference (in rupees) between the total and the sum of all shares. 0 = balanced. */
export function splitDifference(total: number, myShare: number, shares: number[]) {
  return fromPaisa(toPaisa(total) - toPaisa(myShare) - shares.reduce((a, s) => a + toPaisa(s), 0));
}
