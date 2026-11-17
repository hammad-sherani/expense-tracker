import { z } from "zod";
import { MAX_AMOUNT } from "@/lib/constants";
import { TAX_TAG_KEYS, WITHHOLDING_TYPE_KEYS } from "@/lib/tax-rates";
import { amountSchema, dateSchema } from "@/lib/validations/money";

export const withholdingSchema = z.object({
  date: dateSchema,
  type: z.enum(WITHHOLDING_TYPE_KEYS, { error: "Pick a type" }),
  section: z.string().trim().max(30, "Use 30 characters or fewer"),
  amount: amountSchema,
  adjustable: z.boolean(),
  note: z.string().trim().max(200, "Use 200 characters or fewer"),
});
export type WithholdingValues = z.infer<typeof withholdingSchema>;

export const reminderSchema = z.object({
  title: z.string().trim().min(2, "Enter at least 2 characters").max(80, "Use 80 characters or fewer"),
  date: dateSchema,
  yearly: z.boolean(),
  notes: z.string().trim().max(300, "Use 300 characters or fewer"),
});
export type ReminderValues = z.infer<typeof reminderSchema>;

export const taxTagSchema = z.union([z.enum(TAX_TAG_KEYS), z.literal("")]);

/** Tax an employer deducted from a salary: "" or 0 = none. */
export const taxDeductedSchema = z
  .string()
  .trim()
  .refine((v) => v === "" || /^\d+(\.\d{1,2})?$/.test(v), "Enter a valid amount (numbers only, up to 2 decimals)")
  .refine((v) => Number(v || 0) <= MAX_AMOUNT, "Amount is too large");
