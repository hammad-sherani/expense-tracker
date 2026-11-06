import type { PaymentMethodValue } from "@/lib/constants";
import type { IncomeTypeValue, WalletTypeValue } from "@/lib/wallets";

export type FriendDTO = { id: string; name: string };

export type CategoryDTO = { id: string; name: string; icon: string; color: string; archived: boolean };

export type WalletDTO = {
  id: string;
  name: string;
  type: WalletTypeValue;
  color: string;
  openingBalance: number;
  balance: number;
  archived: boolean;
};

/** Wallet as shown on an expense/income row. */
export type WalletRef = { id: string; name: string; type: WalletTypeValue; color: string };

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
  /** Everyone's share (friendId null = me), when recorded. Includes friends who aren't owed anything by me. */
  shares: { friendId: string | null; amount: number }[];
  /** "Pay back by" date of its dues, "YYYY-MM-DD". */
  dueDate: string | null;
};

export type GroupRef = { id: string; name: string; emoji: string | null };

/** Serializable expense passed from the server to client components. */
export type ExpenseDTO = {
  id: string;
  amount: number;
  description: string;
  /** Calendar day as "YYYY-MM-DD". */
  date: string;
  /** "Uncategorized" (id "") when the category was deleted. */
  category: CategoryDTO;
  wallet: WalletRef | null;
  /** v1 payment method, only for old expenses without a wallet. */
  paymentMethod: PaymentMethodValue | null;
  notes: string | null;
  split: ExpenseSplitDTO | null;
  group: GroupRef | null;
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
  /** "Pay back by" date, "YYYY-MM-DD". */
  dueDate: string | null;
  /** Still pending after its due date. */
  overdue: boolean;
  createdAt: string;
  expense: { id: string; description: string; date: string; splitTotal: number | null } | null;
  payments: DuePaymentDTO[];
};

export type FriendDuesDTO = {
  friend: FriendDTO;
  /** Pending total for the selected direction. */
  remaining: number;
  overdueCount: number;
  dues: DueDTO[];
};

export type DuesSummary = { owedToMe: number; iOwe: number; net: number; friendsOwing: number; overdue: number };

export type ActionResult<T = undefined> =
  | { ok: true; data: T; message?: string; warnings?: string[] }
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
  /** Income recorded that month. */
  income: number;
  isSelected: boolean;
};
export type DailyPoint = { day: number; label: string; total: number };
export type ComparisonPoint = { day: number; current: number | null; previous: number | null };
export type CategorySlice = {
  category: CategoryDTO;
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

export type IncomeDTO = {
  id: string;
  amount: number;
  source: string;
  type: IncomeTypeValue;
  wallet: WalletRef | null;
  /** Calendar day "YYYY-MM-DD". */
  date: string;
  notes: string | null;
  createdAt: string;
};

export type IncomeListResult = {
  items: IncomeDTO[];
  total: number;
  page: number;
  pageCount: number;
  filteredSum: number;
  periodSum: number;
};
