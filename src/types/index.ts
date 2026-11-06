import type { CategoryValue, PaymentMethodValue } from "@/lib/constants";

export type FriendDTO = { id: string; name: string };

export type DueDirectionValue = "OWED_TO_ME" | "I_OWE";

/** How a split expense was divided. Only present when the expense is split. */
export type ExpenseSplitDTO = {
  /** Whole bill. The expense `amount` is my share. */
  total: number;
  /** null = I paid. */
  paidBy: FriendDTO | null;
  /** Friends with a due on this expense. */
  participants: {
    dueId: string;
    friend: FriendDTO;
    direction: DueDirectionValue;
    share: number;
    paidAmount: number;
  }[];
};

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
  split: ExpenseSplitDTO | null;
  /** ISO timestamps */
  createdAt: string;
  updatedAt: string;
};

export type DuePaymentDTO = { id: string; amount: number; date: string; note: string | null };

export type DueDTO = {
  id: string;
  /** What it was for: the expense description, or the standalone due's own. */
  description: string;
  /** Calendar day "YYYY-MM-DD": expense date, or the standalone due's date. */
  date: string;
  /** true = not tied to an expense (e.g. paid fully for family). */
  standalone: boolean;
  direction: DueDirectionValue;
  amount: number;
  paidAmount: number;
  remaining: number;
  createdAt: string;
  expense: { id: string; description: string; date: string; splitTotal: number | null } | null;
  payments: DuePaymentDTO[];
};

export type FriendDuesDTO = {
  friend: FriendDTO;
  /** Pending total for the selected direction. */
  remaining: number;
  dues: DueDTO[];
};

export type DuesSummary = { owedToMe: number; iOwe: number; net: number; friendsOwing: number };

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
