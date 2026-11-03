import type { CategoryValue, PaymentMethodValue } from "@/lib/constants";

/** Serializable expense passed from the server to client components. */
export type ExpenseDTO = {
  id: string;
  amount: number;
  description: string;
  /** Calendar day as "YYYY-MM-DD". */
  date: string;
  category: CategoryValue;
  paymentMethod: PaymentMethodValue | null;
  notes: string | null;
  /** ISO timestamps */
  createdAt: string;
  updatedAt: string;
};

export type ActionResult<T = undefined> =
  | { ok: true; data: T; message?: string }
  | { ok: false; error: string; fieldErrors?: Record<string, string[] | undefined> };

export type SummaryCard = {
  key: string;
  label: string;
  value: number;
  hint: string;
  /** % change vs comparison period; null when not meaningful. */
  change?: number | null;
  changeLabel?: string;
};

export type TrendPoint = {
  key: string;
  label: string;
  fullLabel: string;
  total: number;
  isSelected: boolean;
};
export type DailyPoint = { day: number; label: string; total: number };
export type ComparisonPoint = { day: number; current: number | null; previous: number | null };
export type CategorySlice = {
  category: CategoryValue;
  total: number;
  count: number;
  percent: number;
};

export type DashboardData = {
  periodLabel: string;
  cards: SummaryCard[];
  trend: TrendPoint[];
  daily: { title: string; points: DailyPoint[] };
  comparison: {
    currentLabel: string;
    previousLabel: string;
    currentTotal: number;
    previousTotal: number;
    change: number | null;
    points: ComparisonPoint[];
  };
  categories: { total: number; slices: CategorySlice[] };
  recent: ExpenseDTO[];
  expenseCount: number;
};

export type ExpenseListResult = {
  items: ExpenseDTO[];
  total: number;
  page: number;
  pageCount: number;
  /** Sum of amounts for the filtered result set. */
  filteredSum: number;
  /** Sum of amounts for the whole period (ignores search/category). */
  periodSum: number;
  periodCount: number;
};
