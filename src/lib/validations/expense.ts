import { z } from "zod";
import { MAX_AMOUNT, SORT_OPTIONS } from "@/lib/constants";
import { isValidDateInput } from "@/lib/dates";

const AMOUNT_RE = /^\d+(\.\d{1,2})?$/;
const OBJECT_ID_RE = /^[a-f\d]{24}$/i;

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
  categoryId: z.string({ error: "Select a category" }).regex(OBJECT_ID_RE, "Select a category"),
  // "" means "not specified"
  walletId: z.union([z.string().regex(OBJECT_ID_RE, "Choose a wallet"), z.literal("")]),
  /** Trip/group the bill belongs to ("" = none). */
  groupId: z.union([z.string().regex(OBJECT_ID_RE, "Choose a group"), z.literal("")]),
  notes: z.string().trim().max(1000, "Notes must be 1000 characters or fewer"),
  /**
   * Splitting the bill with friends. When enabled, `amount` is the WHOLE bill;
   * only `myShare` becomes the expense and the rest become dues.
   */
  split: z.object({
    enabled: z.boolean(),
    /** "me" or a friend id. */
    paidBy: z.string(),
    myShare: z.string().trim(),
    participants: z.array(z.object({ friendId: z.string(), share: z.string().trim() })).max(20),
    /** Optional "pay back by" date for the dues this creates ("" = none). */
    dueDate: z.union([z.string().refine(isValidDateInput, "Enter a valid date"), z.literal("")]),
  }),
}).superRefine((v, ctx) => {
  if (!v.split.enabled) return;
  const { split } = v;
  const money = (s: string) => AMOUNT_RE.test(s);

  if (split.participants.length === 0) {
    ctx.addIssue({ code: "custom", path: ["split", "participants"], message: "Add at least one friend to split with" });
    return;
  }
  const ids = split.participants.map((p) => p.friendId);
  if (ids.some((id) => !OBJECT_ID_RE.test(id))) {
    ctx.addIssue({ code: "custom", path: ["split", "participants"], message: "Choose a saved friend" });
    return;
  }
  if (new Set(ids).size !== ids.length) {
    ctx.addIssue({ code: "custom", path: ["split", "participants"], message: "Each friend can only be added once" });
  }
  if (split.paidBy !== "me" && !ids.includes(split.paidBy)) {
    ctx.addIssue({ code: "custom", path: ["split", "paidBy"], message: "The payer must be part of the split" });
  }
  if (!money(split.myShare) || Number(split.myShare) <= 0) {
    ctx.addIssue({ code: "custom", path: ["split", "myShare"], message: "Your share must be greater than 0" });
  }
  split.participants.forEach((p, i) => {
    if (!money(p.share)) {
      ctx.addIssue({ code: "custom", path: ["split", "participants", i, "share"], message: "Enter a valid amount" });
    } else if (Number(p.share) <= 0) {
      // A friend with a Rs. 0 share would silently create no due.
      ctx.addIssue({
        code: "custom",
        path: ["split", "participants", i, "share"],
        message: "Each friend's share must be more than 0. Remove friends who weren't part of the bill.",
      });
    }
  });
  if (!money(v.amount)) return;
  const toPaisa = (s: string) => Math.round(Number(s || 0) * 100);
  const diff = toPaisa(v.amount) - toPaisa(split.myShare) - split.participants.reduce((a, p) => a + toPaisa(p.share), 0);
  if (diff !== 0) {
    ctx.addIssue({
      code: "custom",
      path: ["split", "participants"],
      message: `Shares must add up to the total bill (${diff > 0 ? "Rs. " + diff / 100 + " left" : "Rs. " + -diff / 100 + " over"})`,
    });
  }
});

export type ExpenseFormValues = z.infer<typeof expenseFormSchema>;

export const objectIdSchema = z.string().regex(OBJECT_ID_RE, "Invalid id");

export const EMPTY_SPLIT: ExpenseFormValues["split"] = {
  enabled: false,
  paidBy: "me",
  myShare: "",
  participants: [],
  dueDate: "",
};

/** Maps Zod issues to dotted field paths, e.g. "split.participants.0.share". */
export function issuesToFieldErrors(error: z.ZodError) {
  const out: Record<string, string[]> = {};
  for (const issue of error.issues) {
    const key = issue.path.join(".") || "_form";
    (out[key] ??= []).push(issue.message);
  }
  return out;
}

/** Search params accepted by the expenses list and the CSV export. */
export const expenseListParamsSchema = z.object({
  q: z.string().trim().max(100).catch(""),
  category: z.string().regex(OBJECT_ID_RE).optional().catch(undefined),
  wallet: z.string().regex(OBJECT_ID_RE).optional().catch(undefined),
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
    wallet: first(sp.wallet) || undefined,
    sort: first(sp.sort) ?? "date-desc",
    page: first(sp.page) ?? 1,
  });
}
