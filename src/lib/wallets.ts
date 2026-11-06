import { Banknote, CreditCard, Landmark, type LucideIcon, Smartphone, Wallet } from "lucide-react";

export const WALLET_TYPES = ["CASH", "BANK", "MOBILE", "CARD", "OTHER"] as const;
export type WalletTypeValue = (typeof WALLET_TYPES)[number];

export const WALLET_TYPE_META: Record<WalletTypeValue, { label: string; icon: LucideIcon; color: string }> = {
  CASH: { label: "Cash", icon: Banknote, color: "#22c55e" },
  BANK: { label: "Bank account", icon: Landmark, color: "#6366f1" },
  MOBILE: { label: "Mobile wallet", icon: Smartphone, color: "#ef4444" },
  CARD: { label: "Card", icon: CreditCard, color: "#0ea5e9" },
  OTHER: { label: "Other", icon: Wallet, color: "#94a3b8" },
};

/** v1 payment method -> wallet created by the migration. */
export const PAYMENT_METHOD_WALLET = {
  CASH: { name: "Cash", type: "CASH" },
  DEBIT_CARD: { name: "Debit card", type: "CARD" },
  CREDIT_CARD: { name: "Credit card", type: "CARD" },
  BANK_TRANSFER: { name: "Bank", type: "BANK" },
  MOBILE_WALLET: { name: "Mobile wallet", type: "MOBILE" },
  OTHER: { name: "Other", type: "OTHER" },
} as const satisfies Record<string, { name: string; type: WalletTypeValue }>;

export const INCOME_TYPES = ["SALARY", "FREELANCE", "BUSINESS", "GIFT", "REFUND", "OTHER"] as const;
export type IncomeTypeValue = (typeof INCOME_TYPES)[number];
export const INCOME_TYPE_LABELS: Record<IncomeTypeValue, string> = {
  SALARY: "Salary",
  FREELANCE: "Freelance",
  BUSINESS: "Business",
  GIFT: "Gift",
  REFUND: "Refund",
  OTHER: "Other",
};
