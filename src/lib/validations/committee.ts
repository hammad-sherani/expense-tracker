import { z } from "zod";
import { todayInput } from "@/lib/dates";
import { amountSchema, dateSchema, optionalWalletId } from "@/lib/validations/money";

const optionalFriendId = z.union([z.string().regex(/^[a-f\d]{24}$/i, "Choose a person"), z.literal("")]);

const pastDate = dateSchema.refine((v) => v <= todayInput(), "The date can't be in the future");

const committeeFields = {
  name: z.string().trim().min(2, "Enter at least 2 characters").max(60, "Use 60 characters or fewer"),
  monthlyAmount: amountSchema,
  members: z.coerce.number({ error: "Enter a number" }).int("Whole numbers only").min(2, "At least 2").max(60, "At most 60"),
  turn: z.coerce.number({ error: "Enter a number" }).int("Whole numbers only").min(1, "At least 1").max(60, "At most 60"),
  startDate: dateSchema,
  notes: z.string().trim().max(500, "Use 500 characters or fewer"),
  /** "" = the user's own share. */
  forFriendId: optionalFriendId.optional(),
};

const turnFits = { path: ["turn"], message: "Your turn can't be after the last member" };

export const committeeEditSchema = z.object(committeeFields).refine((v) => v.turn <= v.members, turnFits);
export type CommitteeEditValues = z.input<typeof committeeEditSchema>;

export const committeeCreateSchema = z
  .object({
    ...committeeFields,
    paidBefore: z.coerce.number({ error: "Enter a number" }).int("Whole numbers only").min(0, "Can't be negative").max(60, "At most 60"),
  })
  .refine((v) => v.turn <= v.members, turnFits)
  .refine((v) => v.paidBefore <= v.members, { path: ["paidBefore"], message: "Can't be more than the number of members" });
export type CommitteeCreateValues = z.input<typeof committeeCreateSchema>;

export const committeePaySchema = z.object({
  amount: amountSchema,
  date: pastDate,
  walletId: optionalWalletId,
  note: z.string().trim().max(200, "Use 200 characters or fewer"),
});
export type CommitteePayValues = z.infer<typeof committeePaySchema>;

export const committeePayoutSchema = z.object({ amount: amountSchema, date: pastDate, walletId: optionalWalletId });
export type CommitteePayoutValues = z.infer<typeof committeePayoutSchema>;
