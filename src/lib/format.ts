const pkr = new Intl.NumberFormat("en-PK", {
  minimumFractionDigits: 0,
  maximumFractionDigits: 2,
});

const pkrCompact = new Intl.NumberFormat("en-PK", {
  notation: "compact",
  maximumFractionDigits: 1,
});

/** Format an amount as PKR, e.g. "Rs. 12,500" or "Rs. 1,250.50". */
export function formatCurrency(amount: number): string {
  const sign = amount < 0 ? "-" : "";
  return `${sign}Rs. ${pkr.format(Math.abs(amount))}`;
}

/** Compact PKR for chart axes, e.g. "Rs. 12.5K". */
export function formatCurrencyCompact(amount: number): string {
  return `Rs. ${pkrCompact.format(amount)}`;
}

export function formatPercent(value: number, digits = 1): string {
  return `${value.toFixed(digits)}%`;
}

/** Round to 2 decimal places, avoiding floating point drift in sums. */
export function roundMoney(value: number): number {
  return Math.round((value + Number.EPSILON) * 100) / 100;
}

/** Percentage change from `previous` to `current`; null when not meaningful. */
export function percentChange(current: number, previous: number): number | null {
  if (previous === 0) return current === 0 ? 0 : null;
  return ((current - previous) / previous) * 100;
}

/** "hammad@gmail.com" -> "h****d@gmail.com" */
export function maskEmail(email: string): string {
  const [name, domain] = email.split("@");
  if (!domain) return email;
  if (name.length <= 2) return `${name[0]}*@${domain}`;
  return `${name[0]}${"*".repeat(Math.min(6, name.length - 2))}${name.at(-1)}@${domain}`;
}
