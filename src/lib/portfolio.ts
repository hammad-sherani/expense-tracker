/**
 * Portfolio maths and labels. Pure, so it runs on the server, in the browser and in tests.
 * Cost uses the average-cost method: a sale removes units at the average price paid so far.
 */

export const ASSET_TYPES = ["MUTUAL_FUND", "SILVER", "GOLD", "STOCK", "OTHER"] as const;
export type AssetTypeValue = (typeof ASSET_TYPES)[number];

export type UnitValue = "units" | "gram" | "tola" | "share";
export type TxnTypeValue = "BUY" | "SELL" | "DIVIDEND";

export const ASSET_META: Record<AssetTypeValue, { label: string; units: UnitValue[] }> = {
  MUTUAL_FUND: { label: "Mutual fund", units: ["units"] },
  SILVER: { label: "Silver", units: ["tola", "gram"] },
  GOLD: { label: "Gold", units: ["tola", "gram"] },
  STOCK: { label: "Stock", units: ["share"] },
  OTHER: { label: "Other", units: ["units"] },
};

export const GRAMS_PER_OUNCE = 31.1034768;
export const GRAMS_PER_TOLA = 11.6638038;

/** Market symbol for assets with an automatic price. */
export const METAL_SYMBOL: Partial<Record<AssetTypeValue, "XAG" | "XAU">> = { SILVER: "XAG", GOLD: "XAU" };

export function pkrPerGram(usdPerOunce: number, pkrPerUsd: number) {
  return (usdPerOunce * pkrPerUsd) / GRAMS_PER_OUNCE;
}

/** Price of one gram/tola in PKR, including the local premium. */
export function metalUnitPrice(perGram: number, unit: string, premiumPct: number) {
  const grams = unit === "tola" ? GRAMS_PER_TOLA : 1;
  return Math.round(perGram * grams * (1 + premiumPct / 100) * 100) / 100;
}

const unitsFormat = new Intl.NumberFormat("en-PK", { maximumFractionDigits: 4 });
export const formatUnits = (n: number) => unitsFormat.format(n);

/** "10 tola", "1 gram", "2 grams", "1,500 units", "1 share". */
export function unitsLabel(n: number, unit: string) {
  if (unit === "tola") return `${formatUnits(n)} tola`;
  const one = unit === "units" ? "unit" : unit;
  return `${formatUnits(n)} ${n === 1 ? one : `${one}s`}`;
}

/** "per tola", "per unit"... */
export const perUnit = (unit: string) => `per ${unit === "units" ? "unit" : unit}`;

export type TxnLike = {
  id: string;
  type: TxnTypeValue;
  /** "YYYY-MM-DD" */
  date: string;
  /** Tie-break for the same day: ISO timestamp. */
  createdAt: string;
  units: number;
  amount: number;
};

export type Position = {
  units: number;
  cost: number;
  avgCost: number;
  realized: number;
  dividends: number;
  /** The first sale that sells more than was held at that point. */
  oversold: { id: string; date: string; held: number; tried: number } | null;
};

const EPSILON = 1e-6;
const roundUnits = (n: number) => Math.round(n * 1e6) / 1e6;
const money = (n: number) => Math.round((n + Number.EPSILON) * 100) / 100;

/** Same day: buys first, so entering a day's trades in any order still works. */
export function sortTxns<T extends TxnLike>(txns: T[]): T[] {
  const rank = (t: TxnLike) => (t.type === "BUY" ? 0 : 1);
  return [...txns].sort(
    (a, b) => a.date.localeCompare(b.date) || rank(a) - rank(b) || a.createdAt.localeCompare(b.createdAt),
  );
}

/** Replays transactions in date order to get the current position. */
export function replayTxns(txns: TxnLike[]): Position {
  let units = 0;
  let cost = 0;
  let realized = 0;
  let dividends = 0;
  let oversold: Position["oversold"] = null;

  for (const t of sortTxns(txns)) {
    if (t.type === "DIVIDEND") {
      dividends += t.amount;
    } else if (t.type === "BUY") {
      units = roundUnits(units + t.units);
      cost += t.amount;
    } else {
      if (t.units > units + EPSILON) {
        oversold ??= { id: t.id, date: t.date, held: units, tried: t.units };
        continue;
      }
      const costOfSold = units > 0 ? (cost / units) * t.units : 0;
      realized += t.amount - costOfSold;
      cost -= costOfSold;
      units = roundUnits(units - t.units);
      if (units <= EPSILON) {
        units = 0;
        cost = 0;
      }
    }
  }

  return {
    units,
    cost: money(cost),
    avgCost: units > 0 ? cost / units : 0,
    realized: money(realized),
    dividends: money(dividends),
    oversold,
  };
}
