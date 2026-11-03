import { z } from "zod";
import { CATEGORIES, MAX_AMOUNT, PAYMENT_METHODS, SORT_OPTIONS } from "@/lib/constants";
import { isValidDateInput } from "@/lib/dates";

const AMOUNT_RE = /^\d+(\.\d{1,2})?$/;

/**
 * Shape of the expense form. All values are strings so the inputs stay fully
 * controlled; the same schema validates Server Action input on the server.
 */
export const expenseFormSchema = z.object({
  amount: z
    .string()
    .trim()
    .min(1, "Amount is required")
    .regex(AMOUNT_RE, "Enter a valid amount (numbers only, up to 2 decimals)")
    .refine((v) => Number(v) > 0, "Amount must be greater than 0")
    .refine((v) => Number(v) <= MAX_AMOUNT, "Amount is too large"),
  description: z
    .string()
    .trim()
    .min(2, "Description must be at least 2 characters")
    .max(200, "Description must be 200 characters or fewer"),
  date: z
    .string()
    .min(1, "Date is required")
    .refine(isValidDateInput, "Enter a valid date"),
  category: z.enum(CATEGORIES, { error: "Select a category" }),
  // "" means "not specified"
  paymentMethod: z.union([z.enum(PAYMENT_METHODS), z.literal("")]),
  notes: z.string().trim().max(1000, "Notes must be 1000 characters or fewer"),
});

export type ExpenseFormValues = z.infer<typeof expenseFormSchema>;

export const objectIdSchema = z.string().regex(/^[a-f\d]{24}$/i, "Invalid expense id");

/** Search params accepted by the expenses list and the CSV export. */
export const expenseListParamsSchema = z.object({
  q: z.string().trim().max(100).catch(""),
  category: z.enum(CATEGORIES).optional().catch(undefined),
  sort: z
    .enum(Object.keys(SORT_OPTIONS) as [keyof typeof SORT_OPTIONS, ...(keyof typeof SORT_OPTIONS)[]])
    .catch("date-desc"),
  page: z.coerce.number().int().min(1).catch(1),
});

export type ExpenseListParams = z.infer<typeof expenseListParamsSchema>;

type RawSearchParams = Record<string, string | string[] | undefined>;

const first = (v: string | string[] | undefined) => (Array.isArray(v) ? v[0] : v);

export function parseExpenseListParams(sp: RawSearchParams): ExpenseListParams {
  return expenseListParamsSchema.parse({
    q: first(sp.q) ?? "",
    category: first(sp.category) || undefined,
    sort: first(sp.sort) ?? "date-desc",
    page: first(sp.page) ?? 1,
  });
}
