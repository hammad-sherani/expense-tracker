import "server-only";
import type { Expense, Prisma } from "@prisma/client";
import { db } from "@/lib/db";
import { PAGE_SIZE, type SortValue } from "@/lib/constants";
import { type Period, periodRange, toDateInput } from "@/lib/dates";
import { roundMoney } from "@/lib/format";
import type { ExpenseListParams } from "@/lib/validations/expense";
import type { ExpenseDTO, ExpenseListResult } from "@/types";

export function toExpenseDTO(expense: Expense): ExpenseDTO {
  return {
    id: expense.id,
    amount: expense.amount,
    description: expense.description,
    date: toDateInput(expense.date),
    category: expense.category,
    paymentMethod: expense.paymentMethod,
    notes: expense.notes,
    createdAt: expense.createdAt.toISOString(),
    updatedAt: expense.updatedAt.toISOString(),
  };
}

export function periodWhere(period: Period): Prisma.ExpenseWhereInput {
  const range = periodRange(period);
  return range ? { date: { gte: range.start, lt: range.end } } : {};
}

function escapeRegex(value: string) {
  return value.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
}

function listWhere(
  userId: string,
  period: Period,
  params: Pick<ExpenseListParams, "q" | "category">,
): Prisma.ExpenseWhereInput {
  return {
    userId,
    ...periodWhere(period),
    ...(params.category ? { category: params.category } : {}),
    // Prisma's MongoDB connector turns `contains` into a $regex without escaping,
    // so escape the user's text to search for it literally.
    ...(params.q ? { description: { contains: escapeRegex(params.q), mode: "insensitive" } } : {}),
  };
}

function orderBy(sort: SortValue): Prisma.ExpenseOrderByWithRelationInput[] {
  switch (sort) {
    case "date-asc":
      return [{ date: "asc" }, { createdAt: "asc" }];
    case "amount-desc":
      return [{ amount: "desc" }, { date: "desc" }];
    case "amount-asc":
      return [{ amount: "asc" }, { date: "desc" }];
    case "date-desc":
    default:
      return [{ date: "desc" }, { createdAt: "desc" }];
  }
}

export async function listExpenses(
  userId: string,
  period: Period,
  params: ExpenseListParams,
): Promise<ExpenseListResult> {
  const where = listWhere(userId, period, params);
  const baseWhere = { userId, ...periodWhere(period) };

  const [total, filteredAgg, periodAgg] = await Promise.all([
    db.expense.count({ where }),
    db.expense.aggregate({ where, _sum: { amount: true } }),
    db.expense.aggregate({ where: baseWhere, _sum: { amount: true }, _count: { _all: true } }),
  ]);

  const pageCount = Math.max(1, Math.ceil(total / PAGE_SIZE));
  const page = Math.min(params.page, pageCount);

  const rows = await db.expense.findMany({
    where,
    orderBy: orderBy(params.sort),
    skip: (page - 1) * PAGE_SIZE,
    take: PAGE_SIZE,
  });

  return {
    items: rows.map(toExpenseDTO),
    total,
    page,
    pageCount,
    filteredSum: roundMoney(filteredAgg._sum.amount ?? 0),
    periodSum: roundMoney(periodAgg._sum.amount ?? 0),
    periodCount: periodAgg._count._all,
  };
}

/** All expenses matching the filters (no pagination) – used for CSV export. */
export async function exportExpenses(userId: string, period: Period, params: ExpenseListParams) {
  const rows = await db.expense.findMany({
    where: listWhere(userId, period, params),
    orderBy: orderBy(params.sort),
  });
  return rows.map(toExpenseDTO);
}
