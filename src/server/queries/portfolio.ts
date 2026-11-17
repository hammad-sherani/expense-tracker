import "server-only";
import { Prisma } from "@prisma/client";
import { db } from "@/lib/db";
import { diffInDays, formatExpenseDate, toDateInput, todayUTC } from "@/lib/dates";
import { roundMoney } from "@/lib/format";
import {
  ASSET_META,
  type AssetTypeValue,
  METAL_SYMBOL,
  metalUnitPrice,
  replayTxns,
  sortTxns,
  type TxnLike,
  type TxnTypeValue,
} from "@/lib/portfolio";
import { getMarketQuote, type MarketQuoteDTO, type MarketSymbol } from "@/server/market";
import { netWorthParts } from "@/server/queries/net-worth";

export type HoldingDTO = {
  id: string;
  name: string;
  type: AssetTypeValue;
  unit: string;
  autoPrice: boolean;
  premiumPct: number;
  notes: string | null;
  archived: boolean;
  units: number;
  avgCost: number;
  cost: number;
  /** null only when nothing has ever been bought. */
  currentPrice: number | null;
  /** "Live rate · updated 2h ago", "Your price · 3 Nov"... */
  priceNote: string;
  /** The price may be out of date. */
  priceStale: boolean;
  /** Today's rate for silver/gold, offered when entering a price by hand. */
  marketPrice: number | null;
  value: number;
  unrealized: number;
  returnPct: number | null;
  realized: number;
  dividends: number;
  totalGain: number;
  txnCount: number;
};

export type TxnDTO = {
  id: string;
  type: TxnTypeValue;
  date: string;
  units: number;
  price: number;
  amount: number;
  fees: number;
  wallet: { id: string; name: string } | null;
  note: string | null;
};

export type PriceRowDTO = { id: string; date: string; price: number; source: "MANUAL" | "AUTO" };
export type PricePoint = { date: string; label: string; price: number };
export type AllocationRow = { key: string; label: string; sub: string; value: number; percent: number };

const STALE_MANUAL_DAYS = 30;

const include = {
  txns: { include: { wallet: { select: { id: true, name: true } } } },
  prices: { orderBy: [{ date: "desc" }, { createdAt: "desc" }] },
} satisfies Prisma.InvestmentInclude;
type Row = Prisma.InvestmentGetPayload<{ include: typeof include }>;

const toTxnLike = (t: Row["txns"][number]): TxnLike => ({
  id: t.id,
  type: t.type,
  date: toDateInput(t.date),
  createdAt: t.createdAt.toISOString(),
  units: t.units,
  amount: t.amount,
});

function ago(from: Date) {
  const minutes = Math.max(0, Math.round((Date.now() - from.getTime()) / 60_000));
  if (minutes < 60) return `${Math.max(1, minutes)} min ago`;
  const hours = Math.round(minutes / 60);
  if (hours < 48) return `${hours}h ago`;
  return `${Math.round(hours / 24)}d ago`;
}

const shortDate = (d: Date) => formatExpenseDate(d, { day: "numeric", month: "short" });

type Resolved = { price: number | null; note: string; stale: boolean; market: number | null; autoToday: number | null };

/**
 * Which price counts right now:
 * - silver/gold on auto: the market rate (with premium), unless the user entered one for today;
 * - everything else: the latest price the user entered, or else the last trade price.
 */
function resolvePrice(row: Row, quote: MarketQuoteDTO | null, today: Date): Resolved {
  const market = quote ? metalUnitPrice(quote.pkrPerGram, row.unit, row.premiumPct) : null;
  const manual = row.prices.find((p) => p.source === "MANUAL");
  const manualToday = manual && manual.date.getTime() === today.getTime() ? manual : undefined;
  const auto = row.autoPrice && METAL_SYMBOL[row.type as AssetTypeValue] !== undefined;

  if (manualToday) {
    return { price: manualToday.price, note: "Your price today", stale: false, market, autoToday: auto ? market : null };
  }
  if (auto && quote && market !== null) {
    const premium = row.premiumPct ? ` · ${row.premiumPct > 0 ? "+" : ""}${row.premiumPct}% premium` : "";
    return {
      price: market,
      note: `${quote.stale ? "Last known rate" : "Live rate"} · ${ago(quote.fetchedAt)}${premium}`,
      stale: quote.stale,
      market,
      autoToday: quote.stale ? null : market,
    };
  }

  const lastTrade = sortTxns(row.txns.filter((t) => t.type !== "DIVIDEND").map(toTxnLike)).at(-1);
  const lastTradeRow = lastTrade ? row.txns.find((t) => t.id === lastTrade.id) : undefined;
  if (manual && (!lastTradeRow || manual.date >= lastTradeRow.date)) {
    return {
      price: manual.price,
      note: `Your price · ${shortDate(manual.date)}`,
      stale: diffInDays(manual.date, today) > STALE_MANUAL_DAYS,
      market,
      autoToday: null,
    };
  }
  if (lastTradeRow) {
    return {
      price: lastTradeRow.price,
      note: `Last trade price · ${shortDate(lastTradeRow.date)}`,
      stale: diffInDays(lastTradeRow.date, today) > STALE_MANUAL_DAYS,
      market,
      autoToday: null,
    };
  }
  return { price: null, note: "No price yet", stale: false, market, autoToday: null };
}

function buildHolding(row: Row, resolved: Resolved): HoldingDTO {
  const position = replayTxns(row.txns.map(toTxnLike));
  const value = roundMoney(position.units * (resolved.price ?? 0));
  const unrealized = position.units > 0 ? roundMoney(value - position.cost) : 0;
  return {
    id: row.id,
    name: row.name,
    type: row.type,
    unit: row.unit,
    autoPrice: row.autoPrice,
    premiumPct: row.premiumPct,
    notes: row.notes,
    archived: Boolean(row.archivedAt),
    units: position.units,
    avgCost: position.avgCost,
    cost: position.cost,
    currentPrice: resolved.price,
    priceNote: resolved.note,
    priceStale: resolved.stale,
    marketPrice: resolved.market,
    value,
    unrealized,
    returnPct: position.cost > 0 ? (unrealized / position.cost) * 100 : null,
    realized: position.realized,
    dividends: position.dividends,
    totalGain: roundMoney(unrealized + position.realized + position.dividends),
    txnCount: row.txns.length,
  };
}

async function loadQuotes(rows: Row[]) {
  const symbols = [
    ...new Set(rows.map((r) => METAL_SYMBOL[r.type as AssetTypeValue]).filter((s): s is MarketSymbol => Boolean(s))),
  ];
  const quotes = await Promise.all(symbols.map(async (s) => [s, await getMarketQuote(s)] as const));
  return new Map(quotes);
}

/** Keeps one automatic price per day, which is what the price history chart draws. */
async function recordAutoPrice(row: Row, price: number, today: Date) {
  const existing = row.prices.find((p) => p.source === "AUTO" && p.date.getTime() === today.getTime());
  if (existing && Math.abs(existing.price - price) < 0.005) return;
  try {
    await db.investmentPrice.upsert({
      where: { investmentId_date_source: { investmentId: row.id, date: today, source: "AUTO" } },
      create: { userId: row.userId, investmentId: row.id, date: today, price, source: "AUTO" },
      update: { price },
    });
  } catch (e) {
    // Two page loads recording the same day: the other one won.
    if (!(e instanceof Prisma.PrismaClientKnownRequestError && e.code === "P2002")) {
      console.error("recording auto price failed", e);
    }
  }
}

async function resolveAll(rows: Row[]) {
  const today = todayUTC();
  const quotes = await loadQuotes(rows);
  const resolved = rows.map((r) => {
    const symbol = METAL_SYMBOL[r.type as AssetTypeValue];
    return resolvePrice(r, symbol ? (quotes.get(symbol) ?? null) : null, today);
  });
  await Promise.all(
    rows.map((r, i) => {
      const auto = resolved[i].autoToday;
      return auto !== null && !r.archivedAt ? recordAutoPrice(r, auto, today) : null;
    }),
  );
  return resolved;
}

export async function getPortfolio(userId: string) {
  const rows = await db.investment.findMany({ where: { userId }, include, orderBy: { createdAt: "asc" } });
  const resolved = await resolveAll(rows);
  const all = rows.map((r, i) => buildHolding(r, resolved[i])).sort((a, b) => b.value - a.value);
  const holdings = all.filter((h) => !h.archived);
  const closed = all.filter((h) => h.archived);

  const sum = (list: HoldingDTO[], f: (h: HoldingDTO) => number) => roundMoney(list.reduce((a, h) => a + f(h), 0));
  const invested = sum(holdings, (h) => h.cost);
  const value = sum(holdings, (h) => h.value);
  const unrealized = roundMoney(value - invested);
  const realized = sum(all, (h) => h.realized);
  const dividends = sum(all, (h) => h.dividends);

  const netWorth = await netWorthParts(userId, value);

  const pct = (v: number) => (value > 0 ? (v / value) * 100 : 0);
  const open = holdings.filter((h) => h.value > 0);
  const byHolding: AllocationRow[] = open.map((h) => ({
    key: h.id,
    label: h.name,
    sub: ASSET_META[h.type].label,
    value: h.value,
    percent: pct(h.value),
  }));
  const types = [...new Set(open.map((h) => h.type))];
  const byType: AllocationRow[] = types
    .map((t) => {
      const v = sum(open.filter((h) => h.type === t), (h) => h.value);
      return { key: t, label: ASSET_META[t].label, sub: "", value: v, percent: pct(v) };
    })
    .sort((a, b) => b.value - a.value);

  return {
    holdings,
    closed,
    byHolding,
    byType,
    totals: {
      invested,
      value,
      unrealized,
      returnPct: invested > 0 ? (unrealized / invested) * 100 : null,
      realized,
      dividends,
      totalGain: roundMoney(unrealized + realized + dividends),
    },
    netWorth,
  };
}

export async function getHolding(userId: string, id: string) {
  const row = await db.investment.findFirst({ where: { id, userId }, include });
  if (!row) return null;
  const [resolved] = await resolveAll([row]);
  const holding = buildHolding(row, resolved);
  const today = toDateInput(todayUTC());

  const byId = new Map(row.txns.map((t) => [t.id, t]));
  const txns: TxnDTO[] = sortTxns(row.txns.map(toTxnLike))
    .reverse()
    .map((l) => {
      const t = byId.get(l.id)!;
      return {
        id: t.id,
        type: t.type,
        date: l.date,
        units: t.units,
        price: t.price,
        amount: t.amount,
        fees: t.fees,
        wallet: t.wallet,
        note: t.note,
      };
    });

  // Chart: one point per day. Your own price beats the automatic one, which beats a trade price.
  const points = new Map<string, number>();
  for (const t of sortTxns(row.txns.map(toTxnLike))) {
    if (t.type !== "DIVIDEND") points.set(t.date, byId.get(t.id)!.price);
  }
  for (const source of ["AUTO", "MANUAL"] as const) {
    for (const p of row.prices) if (p.source === source) points.set(toDateInput(p.date), p.price);
  }
  if (holding.currentPrice !== null && holding.units > 0) points.set(today, holding.currentPrice);
  const history: PricePoint[] = [...points.entries()]
    .sort(([a], [b]) => a.localeCompare(b))
    .map(([date, price]) => ({ date, label: formatExpenseDate(date, { day: "numeric", month: "short" }), price }));

  const prices: PriceRowDTO[] = row.prices
    .filter((p) => p.source === "MANUAL")
    .slice(0, 20)
    .map((p) => ({ id: p.id, date: toDateInput(p.date), price: p.price, source: p.source }));

  return { holding, txns, prices, history };
}
