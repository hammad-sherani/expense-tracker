import {
  BookOpen,
  Car,
  Clapperboard,
  HeartPulse,
  Home,
  type LucideIcon,
  MoreHorizontal,
  Plane,
  Receipt,
  ShoppingBag,
  ShoppingBasket,
  UtensilsCrossed,
} from "lucide-react";

export const CATEGORIES = [
  "FOOD",
  "TRANSPORT",
  "SHOPPING",
  "BILLS_UTILITIES",
  "RENT",
  "HEALTHCARE",
  "ENTERTAINMENT",
  "EDUCATION",
  "GROCERIES",
  "TRAVEL",
  "OTHER",
] as const;

export type CategoryValue = (typeof CATEGORIES)[number];

export const PAYMENT_METHODS = [
  "CASH",
  "DEBIT_CARD",
  "CREDIT_CARD",
  "BANK_TRANSFER",
  "MOBILE_WALLET",
  "OTHER",
] as const;

export type PaymentMethodValue = (typeof PAYMENT_METHODS)[number];

type CategoryMeta = {
  label: string;
  icon: LucideIcon;
  /** Chart / accent color (hex so it works in SVG and CSS). */
  color: string;
};

export const CATEGORY_META: Record<CategoryValue, CategoryMeta> = {
  FOOD: { label: "Food", icon: UtensilsCrossed, color: "#f97316" },
  TRANSPORT: { label: "Transport", icon: Car, color: "#0ea5e9" },
  SHOPPING: { label: "Shopping", icon: ShoppingBag, color: "#ec4899" },
  BILLS_UTILITIES: { label: "Bills & Utilities", icon: Receipt, color: "#eab308" },
  RENT: { label: "Rent", icon: Home, color: "#6366f1" },
  HEALTHCARE: { label: "Healthcare", icon: HeartPulse, color: "#ef4444" },
  ENTERTAINMENT: { label: "Entertainment", icon: Clapperboard, color: "#a855f7" },
  EDUCATION: { label: "Education", icon: BookOpen, color: "#14b8a6" },
  GROCERIES: { label: "Groceries", icon: ShoppingBasket, color: "#22c55e" },
  TRAVEL: { label: "Travel", icon: Plane, color: "#06b6d4" },
  OTHER: { label: "Other", icon: MoreHorizontal, color: "#94a3b8" },
};

export const PAYMENT_METHOD_LABELS: Record<PaymentMethodValue, string> = {
  CASH: "Cash",
  DEBIT_CARD: "Debit Card",
  CREDIT_CARD: "Credit Card",
  BANK_TRANSFER: "Bank Transfer",
  MOBILE_WALLET: "Mobile Wallet (JazzCash / Easypaisa)",
  OTHER: "Other",
};

export const SORT_OPTIONS = {
  "date-desc": "Newest first",
  "date-asc": "Oldest first",
  "amount-desc": "Highest amount",
  "amount-asc": "Lowest amount",
} as const;

export type SortValue = keyof typeof SORT_OPTIONS;

export const DEFAULT_SORT: SortValue = "date-desc";
export const PAGE_SIZE = 10;
export const MAX_AMOUNT = 100_000_000;
