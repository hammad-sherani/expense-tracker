import { z } from "zod";
import { MAX_AMOUNT } from "@/lib/constants";
import { todayInput } from "@/lib/dates";
import { amountSchema, dateSchema, optionalWalletId } from "@/lib/validations/money";

const pastDate = dateSchema.refine((v) => v <= todayInput(), "The date can't be in the future");
const MONEY_RE = /^\d+(\.\d{1,2})?$/;

/** An amount that may be 0 (or empty for 0). */
const zeroOrMore = z
  .string()
  .trim()
  .refine((v) => v === "" || MONEY_RE.test(v), "Enter a valid amount (numbers only, up to 2 decimals)")
  .refine((v) => Number(v || 0) <= MAX_AMOUNT, "Amount is too large");

export const loanSchema = z
  .object({
    name: z.string().trim().min(2, "Enter at least 2 characters").max(60, "Use 60 characters or fewer"),
    lender: z.string().trim().max(60, "Use 60 characters or fewer"),
    principal: amountSchema,
    annualRatePct: z
      .string()
      .trim()
      .refine((v) => v === "" || /^\d{1,3}(\.\d{1,2})?$/.test(v), "Enter a rate like 12 or 14.5")
      .refine((v) => Number(v || 0) <= 100, "At most 100%"),
    monthlyInstallment: amountSchema,
    startDate: dateSchema,
    receivedWalletId: optionalWalletId,
    alreadyRepaid: zeroOrMore,
    notes: z.string().trim().max(500, "Use 500 characters or fewer"),
  })
  .refine((v) => Number(v.alreadyRepaid || 0) < Number(v.principal), {
    path: ["alreadyRepaid"],
    message: "Must be less than the loan amount",
  });
export type LoanValues = z.infer<typeof loanSchema>;

export const loanPaySchema = z
  .object({
    amount: amountSchema,
    /** Interest part of the amount (the rest repays the loan). */
    interest: zeroOrMore,
    date: pastDate,
    walletId: optionalWalletId,
  })
  .refine((v) => Number(v.interest || 0) <= Number(v.amount), { path: ["interest"], message: "Can't be more than the amount paid" });
export type LoanPayValues = z.infer<typeof loanPaySchema>;
