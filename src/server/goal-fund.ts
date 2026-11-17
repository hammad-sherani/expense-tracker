import "server-only";
import type { Prisma } from "@prisma/client";
import { roundMoney } from "@/lib/format";

/** What's in a goal's fund right now. Pass `excludeExpenseId` when that expense is being edited. */
export async function goalBalance(
  tx: Prisma.TransactionClient,
  userId: string,
  goalId: string,
  excludeExpenseId?: string,
) {
  const [entries, spent] = await Promise.all([
    tx.goalEntry.groupBy({ by: ["type"], where: { userId, goalId }, _sum: { amount: true } }),
    tx.expense.aggregate({
      where: { userId, goalId, ...(excludeExpenseId ? { id: { not: excludeExpenseId } } : {}) },
      _sum: { amount: true },
    }),
  ]);
  const of = (type: "DEPOSIT" | "WITHDRAW") => entries.find((e) => e.type === type)?._sum.amount ?? 0;
  return roundMoney(of("DEPOSIT") - of("WITHDRAW") - (spent._sum.amount ?? 0));
}
