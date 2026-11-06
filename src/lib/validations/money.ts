import { z } from "zod";
import { ICON_NAMES } from "@/lib/category-icons";
import { MAX_AMOUNT } from "@/lib/constants";
import { isValidDateInput } from "@/lib/dates";
import { INCOME_TYPES, WALLET_TYPES } from "@/lib/wallets";

const AMOUNT_RE = /^\d+(\.\d{1,2})?$/;
const SIGNED_AMOUNT_RE = /^-?\d+(\.\d{1,2})?$/;
const OBJECT_ID_RE = /^[a-f\d]{24}$/i;
const HEX_RE = /^#[0-9a-f]{6}$/i;

export const amountSchema = z
  .string()
  .trim()
  .min(1, "Amount is required")
  .regex(AMOUNT_RE, "Enter a valid amount (numbers only, up to 2 decimals)")
  .refine((v) => Number(v) > 0, "Amount must be greater than 0")
  .refine((v) => Number(v) <= MAX_AMOUNT, "Amount is too large");

export const dateSchema = z.string().min(1, "Date is required").refine(isValidDateInput, "Enter a valid date");
const optionalId = (message: string) => z.union([z.string().regex(OBJECT_ID_RE, message), z.literal("")]);

export const categorySchema = z.object({
  name: z.string().trim().min(1, "Enter a name").max(30, "Use 30 characters or fewer"),
  icon: z.enum(ICON_NAMES as [string, ...string[]], { error: "Pick an icon" }),
  color: z.string().regex(HEX_RE, "Pick a colour"),
});
export type CategoryValues = z.infer<typeof categorySchema>;

export const walletSchema = z.object({
  name: z.string().trim().min(1, "Enter a name").max(30, "Use 30 characters or fewer"),
  type: z.enum(WALLET_TYPES, { error: "Pick a type" }),
  color: z.string().regex(HEX_RE, "Pick a colour"),
  openingBalance: z
    .string()
    .trim()
    .regex(SIGNED_AMOUNT_RE, "Enter a valid amount (a credit card can be negative)")
    .refine((v) => Math.abs(Number(v)) <= MAX_AMOUNT, "Amount is too large"),
});
export type WalletValues = z.infer<typeof walletSchema>;

export const transferSchema = z
  .object({
    fromWalletId: z.string().regex(OBJECT_ID_RE, "Choose a wallet"),
    toWalletId: z.string().regex(OBJECT_ID_RE, "Choose a wallet"),
    amount: amountSchema,
    date: dateSchema,
    note: z.string().trim().max(200, "Use 200 characters or fewer"),
  })
  .refine((v) => v.fromWalletId !== v.toWalletId, { path: ["toWalletId"], message: "Choose a different wallet" });
export type TransferValues = z.infer<typeof transferSchema>;

export const incomeFormSchema = z.object({
  amount: amountSchema,
  source: z.string().trim().min(2, "Enter at least 2 characters").max(200, "Use 200 characters or fewer"),
  type: z.enum(INCOME_TYPES, { error: "Pick a type" }),
  walletId: optionalId("Choose a wallet"),
  date: dateSchema,
  notes: z.string().trim().max(1000, "Use 1000 characters or fewer"),
});
export type IncomeFormValues = z.infer<typeof incomeFormSchema>;

export const objectId = z.string().regex(OBJECT_ID_RE, "Invalid id");
export const optionalWalletId = optionalId("Choose a wallet");

export const budgetSchema = z.object({
  /** "" = overall monthly budget. */
  categoryId: z.union([z.string().regex(OBJECT_ID_RE, "Choose a category"), z.literal("")]),
  amount: amountSchema,
});
export type BudgetValues = z.infer<typeof budgetSchema>;

export const recurringSchema = z
  .object({
    description: z.string().trim().min(2, "Enter at least 2 characters").max(200, "Use 200 characters or fewer"),
    amount: amountSchema,
    categoryId: z.string().regex(OBJECT_ID_RE, "Choose a category"),
    walletId: optionalId("Choose a wallet"),
    frequency: z.enum(["WEEKLY", "MONTHLY", "YEARLY"]),
    interval: z.coerce.number().int("Whole numbers only").min(1, "At least 1").max(24, "At most 24"),
    startDate: dateSchema,
    endDate: z.union([dateSchema, z.literal("")]),
    notes: z.string().trim().max(500, "Use 500 characters or fewer"),
  })
  .refine((v) => !v.endDate || v.endDate >= v.startDate, { path: ["endDate"], message: "End date must be after the first due date" });
export type RecurringValues = z.input<typeof recurringSchema>;

export const groupSchema = z.object({
  name: z.string().trim().min(1, "Enter a name").max(40, "Use 40 characters or fewer"),
  emoji: z.string().trim().max(8),
  memberIds: z.array(z.string().regex(OBJECT_ID_RE)).min(1, "Add at least one person").max(30),
});
export type GroupValues = z.infer<typeof groupSchema>;
