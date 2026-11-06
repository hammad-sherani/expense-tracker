import { z } from "zod";
import { isValidDateInput } from "@/lib/dates";

export const friendNameSchema = z
  .string()
  .trim()
  .min(1, "Enter a name")
  .max(40, "Name must be 40 characters or fewer")
  .transform((s) => s.replace(/\s+/g, " "));

export const paymentSchema = z.object({
  amount: z
    .string()
    .trim()
    .regex(/^\d+(\.\d{1,2})?$/, "Enter a valid amount")
    .refine((v) => Number(v) > 0, "Amount must be greater than 0"),
  date: z.string().refine(isValidDateInput, "Enter a valid date"),
  note: z.string().trim().max(200, "Note must be 200 characters or fewer"),
});

export type PaymentValues = z.infer<typeof paymentSchema>;

/** A due that isn't tied to an expense, e.g. "paid fully for someone else". */
export const manualDueSchema = z.object({
  friendId: z.string().regex(/^[a-f\d]{24}$/i, "Choose a person"),
  direction: z.enum(["OWED_TO_ME", "I_OWE"]),
  amount: z
    .string()
    .trim()
    .min(1, "Amount is required")
    .regex(/^\d+(\.\d{1,2})?$/, "Enter a valid amount (numbers only, up to 2 decimals)")
    .refine((v) => Number(v) > 0, "Amount must be greater than 0")
    .refine((v) => Number(v) <= 100_000_000, "Amount is too large"),
  description: z
    .string()
    .trim()
    .min(2, "Describe what it was for (at least 2 characters)")
    .max(200, "Description must be 200 characters or fewer"),
  date: z.string().refine(isValidDateInput, "Enter a valid date"),
});

export type ManualDueValues = z.infer<typeof manualDueSchema>;
