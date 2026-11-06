import "server-only";
import type { Prisma } from "@prisma/client";
import { z } from "zod";
import { db } from "@/lib/db";
import { PAGE_SIZE } from "@/lib/constants";
import { type Period, periodRange, toDateInput } from "@/lib/dates";
import { roundMoney } from "@/lib/format";
import { INCOME_TYPES } from "@/lib/wallets";
import { toWalletRef } from "@/server/queries/expenses";
import type { IncomeDTO, IncomeListResult } from "@/types";

export const incomeInclude = { wallet: { select: { id: true, name: true, type: true, color: true } } } satisfies Prisma.IncomeInclude;
type IncomeRow = Prisma.IncomeGetPayload<{ include: typeof incomeInclude }>;

export function toIncomeDTO(i: IncomeRow): IncomeDTO {
  return {
    id: i.id,
    amount: i.amount,
    source: i.source,
    type: i.type,
    wallet: toWalletRef(i.wallet),
    date: toDateInput(i.date),
    notes: i.notes,
    createdAt: i.createdAt.toISOString(),
  };
}

const first = (v: string | string[] | undefined) => (Array.isArray(v) ? v[0] : v);

export const incomeListParamsSchema = z.object({
  q: z.string().trim().max(100).catch(""),
  type: z.enum(INCOME_TYPES).optional().catch(undefined),
  page: z.coerce.number().int().min(1).catch(1),
});
export type IncomeListParams = z.infer<typeof incomeListParamsSchema>;

export function parseIncomeListParams(sp: Record<string, string | string[] | undefined>): IncomeListParams {
  return incomeListParamsSchema.parse({ q: first(sp.q) ?? "", type: first(sp.type) || undefined, page: first(sp.page) ?? 1 });
}

function escapeRegex(value: string) {
  return value.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
}

export function incomePeriodWhere(period: Period): Prisma.IncomeWhereInput {
  const range = periodRange(period);
  return range ? { date: { gte: range.start, lt: range.end } } : {};
}

export async function listIncome(userId: string, period: Period, params: IncomeListParams): Promise<IncomeListResult> {
  const base = { userId, ...incomePeriodWhere(period) };
  const where: Prisma.IncomeWhereInput = {
    ...base,
    ...(params.type ? { type: params.type } : {}),
    ...(params.q ? { source: { contains: escapeRegex(params.q), mode: "insensitive" } } : {}),
  };
  const [total, filtered, all] = await Promise.all([
    db.income.count({ where }),
    db.income.aggregate({ where, _sum: { amount: true } }),
    db.income.aggregate({ where: base, _sum: { amount: true } }),
  ]);
  const pageCount = Math.max(1, Math.ceil(total / PAGE_SIZE));
  const page = Math.min(params.page, pageCount);
  const rows = await db.income.findMany({
    where,
    orderBy: [{ date: "desc" }, { createdAt: "desc" }],
    skip: (page - 1) * PAGE_SIZE,
    take: PAGE_SIZE,
    include: incomeInclude,
  });
  return {
    items: rows.map(toIncomeDTO),
    total,
    page,
    pageCount,
    filteredSum: roundMoney(filtered._sum.amount ?? 0),
    periodSum: roundMoney(all._sum.amount ?? 0),
  };
}

/** Total income per "YYYY-MM" between two dates (for dashboard trend and savings). */
export async function incomeByMonth(userId: string, start: Date, end: Date) {
  const rows = await db.income.findMany({
    where: { userId, date: { gte: start, lt: end } },
    select: { amount: true, date: true },
  });
  const out = new Map<string, number>();
  for (const r of rows) {
    const key = toDateInput(r.date).slice(0, 7);
    out.set(key, (out.get(key) ?? 0) + r.amount);
  }
  return out;
}
