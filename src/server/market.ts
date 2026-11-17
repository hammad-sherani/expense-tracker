import "server-only";
import { z } from "zod";
import { db } from "@/lib/db";
import { pkrPerGram } from "@/lib/portfolio";

export type MarketSymbol = "XAG" | "XAU";

export type MarketQuoteDTO = {
  symbol: MarketSymbol;
  pkrPerGram: number;
  fetchedAt: Date;
  /** The latest refresh failed, so this is the last known rate. */
  stale: boolean;
};

const MAX_AGE_MS = 6 * 60 * 60_000;
const RETRY_AFTER_FAILURE_MS = 10 * 60_000;
const TIMEOUT_MS = 5_000;

const metalResponse = z.object({ price: z.number().positive() });
const fxResponse = z.object({ result: z.literal("success"), rates: z.object({ PKR: z.number().positive() }) });

async function fetchJson(url: string) {
  const res = await fetch(url, { cache: "no-store", signal: AbortSignal.timeout(TIMEOUT_MS) });
  if (!res.ok) throw new Error(`${url} responded ${res.status}`);
  return res.json();
}

async function refreshQuote(symbol: MarketSymbol) {
  const base = process.env.MARKET_PRICE_URL || "https://api.gold-api.com/price";
  const fx = process.env.FX_RATE_URL || "https://open.er-api.com/v6/latest/USD";
  const [metal, rate] = await Promise.all([fetchJson(`${base}/${symbol}`), fetchJson(fx)]);
  const usdPerOunce = metalResponse.parse(metal).price;
  const pkrPerUsd = fxResponse.parse(rate).rates.PKR;
  const data = { usdPerOunce, pkrPerUsd, pkrPerGram: pkrPerGram(usdPerOunce, pkrPerUsd), fetchedAt: new Date() };
  return db.marketQuote.upsert({ where: { symbol }, create: { symbol, ...data }, update: data });
}

const inFlight = new Map<MarketSymbol, Promise<unknown>>();
const lastFailure = new Map<MarketSymbol, number>();

/**
 * Latest rate for a metal. Calls the price APIs at most every 6 hours; if they're
 * down, returns the last known rate marked stale (null if there has never been one).
 */
export async function getMarketQuote(symbol: MarketSymbol): Promise<MarketQuoteDTO | null> {
  const cached = await db.marketQuote.findUnique({ where: { symbol } });
  const toDTO = (q: NonNullable<typeof cached>, stale: boolean): MarketQuoteDTO => ({
    symbol,
    pkrPerGram: q.pkrPerGram,
    fetchedAt: q.fetchedAt,
    stale,
  });
  if (cached && Date.now() - cached.fetchedAt.getTime() < MAX_AGE_MS) return toDTO(cached, false);

  // After a failure, don't make every page load wait on a dead API.
  if (Date.now() - (lastFailure.get(symbol) ?? 0) < RETRY_AFTER_FAILURE_MS) return cached ? toDTO(cached, true) : null;

  try {
    let job = inFlight.get(symbol);
    if (!job) {
      job = refreshQuote(symbol).finally(() => inFlight.delete(symbol));
      inFlight.set(symbol, job);
    }
    await job;
    const fresh = await db.marketQuote.findUnique({ where: { symbol } });
    lastFailure.delete(symbol);
    return fresh ? toDTO(fresh, false) : null;
  } catch (error) {
    console.error(`market price refresh failed for ${symbol}`, error);
    lastFailure.set(symbol, Date.now());
    return cached ? toDTO(cached, true) : null;
  }
}
