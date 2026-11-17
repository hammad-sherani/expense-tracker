import { z } from "zod";
import { MAX_AMOUNT } from "@/lib/constants";
import { todayInput } from "@/lib/dates";
import { ASSET_TYPES } from "@/lib/portfolio";
import { amountSchema, dateSchema, optionalWalletId } from "@/lib/validations/money";

const UNITS_RE = /^\d+(\.\d{1,6})?$/;
const FEES_RE = /^\d+(\.\d{1,2})?$/;
const PRICE_RE = /^\d+(\.\d{1,4})?$/;

const pastDate = dateSchema.refine((v) => v <= todayInput(), "The date can't be in the future");

export const txnSchema = z
  .object({
    type: z.enum(["BUY", "SELL", "DIVIDEND"]),
    date: pastDate,
    /** Ignored for dividends. */
    units: z.string().trim(),
    /** Total before fees. */
    amount: amountSchema,
    fees: z.string().trim(),
    walletId: optionalWalletId,
    note: z.string().trim().max(200, "Use 200 characters or fewer"),
  })
  .superRefine((v, ctx) => {
    if (v.fees && !FEES_RE.test(v.fees)) ctx.addIssue({ code: "custom", path: ["fees"], message: "Enter a valid amount" });
    if (v.type === "DIVIDEND") return;
    if (!UNITS_RE.test(v.units) || Number(v.units) <= 0) {
      ctx.addIssue({ code: "custom", path: ["units"], message: "Enter how many (more than 0)" });
    } else if (Number(v.units) > MAX_AMOUNT) {
      ctx.addIssue({ code: "custom", path: ["units"], message: "That's too many" });
    }
    if (v.type === "SELL" && Number(v.fees || 0) >= Number(v.amount)) {
      ctx.addIssue({ code: "custom", path: ["fees"], message: "Fees must be less than the sale amount" });
    }
  });
export type TxnValues = z.infer<typeof txnSchema>;

export const investmentEditSchema = z.object({
  name: z.string().trim().min(2, "Enter at least 2 characters").max(60, "Use 60 characters or fewer"),
  autoPrice: z.boolean(),
  premiumPct: z
    .string()
    .trim()
    .regex(/^-?\d+(\.\d{1,2})?$/, "Enter a percentage")
    .refine((v) => Math.abs(Number(v)) <= 100, "Must be between -100 and 100"),
  notes: z.string().trim().max(500, "Use 500 characters or fewer"),
});
export type InvestmentEditValues = z.infer<typeof investmentEditSchema>;

export const investmentCreateSchema = investmentEditSchema.extend({
  type: z.enum(ASSET_TYPES),
  unit: z.enum(["units", "gram", "tola", "share"]),
});
export type InvestmentCreateValues = z.infer<typeof investmentCreateSchema>;

export const priceSchema = z.object({
  date: pastDate,
  price: z
    .string()
    .trim()
    .regex(PRICE_RE, "Enter a valid price (up to 4 decimals)")
    .refine((v) => Number(v) > 0, "Price must be greater than 0")
    .refine((v) => Number(v) <= MAX_AMOUNT, "Price is too large"),
});
export type PriceValues = z.infer<typeof priceSchema>;
