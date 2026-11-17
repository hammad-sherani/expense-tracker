import { z } from "zod";
import { todayInput } from "@/lib/dates";
import { amountSchema, dateSchema, optionalWalletId } from "@/lib/validations/money";

const OBJECT_ID_RE = /^[a-f\d]{24}$/i;
const MONEY_RE = /^\d+(\.\d{1,2})?$/;

const pastDate = dateSchema.refine((v) => v <= todayInput(), "The date can't be in the future");
const optionalGoalId = z.union([z.string().regex(OBJECT_ID_RE, "Choose a goal"), z.literal("")]);
/** "" = not given. */
const optionalMoney = z.string().trim().refine((v) => v === "" || MONEY_RE.test(v), "Enter a valid amount");
const notes = z.string().trim().max(500, "Use 500 characters or fewer");

export const goalSchema = z.object({
  name: z.string().trim().min(2, "Enter at least 2 characters").max(60, "Use 60 characters or fewer"),
  targetAmount: amountSchema,
  targetDate: z.union([dateSchema, z.literal("")]),
  notes,
});
export type GoalValues = z.infer<typeof goalSchema>;

export const goalCreateSchema = goalSchema.extend({
  alreadySaved: optionalMoney,
  alreadySavedWalletId: optionalWalletId,
});
export type GoalCreateValues = z.infer<typeof goalCreateSchema>;

export const goalMoneySchema = z.object({
  amount: amountSchema,
  date: pastDate,
  walletId: optionalWalletId,
  note: z.string().trim().max(200, "Use 200 characters or fewer"),
});
export type GoalMoneyValues = z.infer<typeof goalMoneySchema>;

export const expectedSchema = z
  .object({
    source: z.string().trim().min(2, "Enter at least 2 characters").max(100, "Use 100 characters or fewer"),
    amount: amountSchema,
    expectedDate: dateSchema,
    goalId: optionalGoalId,
    /** "" = all of it. */
    goalAmount: optionalMoney,
    notes,
  })
  .refine((v) => v.goalAmount === "" || Number(v.goalAmount) <= Number(v.amount), {
    path: ["goalAmount"],
    message: "Can't be more than the payment",
  });
export type ExpectedValues = z.infer<typeof expectedSchema>;

export const receivedSchema = z
  .object({
    amount: amountSchema,
    date: pastDate,
    walletId: optionalWalletId,
    goalId: optionalGoalId,
    goalAmount: optionalMoney,
    expectRest: z.boolean(),
  })
  .refine((v) => Number(v.goalAmount || 0) <= Number(v.amount), {
    path: ["goalAmount"],
    message: "Can't be more than you received",
  })
  .refine((v) => Number(v.goalAmount || 0) === 0 || v.goalId !== "", { path: ["goalId"], message: "Choose a goal" });
export type ReceivedValues = z.infer<typeof receivedSchema>;
