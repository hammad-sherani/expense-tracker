/**
 * Income tax rules for salaried individuals, per tax year. These change every budget:
 * add the new year here (with its source) when a Finance Act is passed.
 */

export type Slab = {
  /** Lower edge of the slab (income above this is taxed at `rate`). */
  over: number;
  /** Tax on income up to `over`. */
  fixed: number;
  /** Rate on the excess over `over`, e.g. 0.11. */
  rate: number;
};

export type TaxRules = {
  taxYear: number;
  slabs: Slab[];
  /** Section 4AB surcharge on the tax, for taxable income above `over`. null = none. */
  surcharge: { over: number; rate: number } | null;
  /** s.61: donations to approved institutions, credit capped at this share of taxable income. */
  donationCap: number;
  /** s.63: approved pension / VPS contributions, credit capped at this share of taxable income. */
  pensionCap: number;
  sources: { label: string; url: string }[];
  checked: string;
};

const COMMON = { donationCap: 0.3, pensionCap: 0.2 };

export const TAX_RULES: TaxRules[] = [
  {
    taxYear: 2026,
    ...COMMON,
    slabs: [
      { over: 0, fixed: 0, rate: 0 },
      { over: 600_000, fixed: 0, rate: 0.01 },
      { over: 1_200_000, fixed: 6_000, rate: 0.11 },
      { over: 2_200_000, fixed: 116_000, rate: 0.23 },
      { over: 3_200_000, fixed: 346_000, rate: 0.3 },
      { over: 4_100_000, fixed: 616_000, rate: 0.35 },
    ],
    surcharge: { over: 10_000_000, rate: 0.09 },
    sources: [
      { label: "Finance Act 2025 (Dawn, budget coverage)", url: "https://www.dawn.com/news/2007489" },
      { label: "FBR", url: "https://www.fbr.gov.pk" },
    ],
    checked: "2026-11-11",
  },
  {
    taxYear: 2027,
    ...COMMON,
    slabs: [
      { over: 0, fixed: 0, rate: 0 },
      { over: 600_000, fixed: 0, rate: 0.01 },
      { over: 1_200_000, fixed: 6_000, rate: 0.11 },
      { over: 2_200_000, fixed: 116_000, rate: 0.2 },
      { over: 3_200_000, fixed: 316_000, rate: 0.25 },
      { over: 4_100_000, fixed: 541_000, rate: 0.29 },
      { over: 5_600_000, fixed: 976_000, rate: 0.32 },
      { over: 7_000_000, fixed: 1_424_000, rate: 0.35 },
    ],
    // Finance Act 2026 removed the salaried surcharge from TY2027.
    surcharge: null,
    sources: [
      { label: "Finance Act 2026 (Mercans summary)", url: "https://mercans.com/resources/statutory-alerts/pakistan-finance-act-2026-27-1-july-2026/" },
      { label: "FBR", url: "https://www.fbr.gov.pk" },
    ],
    checked: "2026-11-11",
  },
];

/** Rules for a tax year; a later year with no rules yet uses the latest known ones, flagged. */
export function rulesFor(taxYear: number): { rules: TaxRules; confirmed: boolean } {
  const exact = TAX_RULES.find((r) => r.taxYear === taxYear);
  if (exact) return { rules: exact, confirmed: true };
  const known = [...TAX_RULES].sort((a, b) => a.taxYear - b.taxYear);
  const fallback = taxYear < known[0].taxYear ? known[0] : known[known.length - 1];
  return { rules: fallback, confirmed: false };
}

/** Kinds of tax deducted at source, with their usual section and whether it counts against the year's tax. */
export const WITHHOLDING_TYPES = {
  SALARY: { label: "Salary (employer)", section: "149", adjustable: true },
  CASH_WITHDRAWAL: { label: "Cash withdrawal", section: "231AB", adjustable: true },
  MOBILE: { label: "Mobile phone", section: "236(1)(a)", adjustable: true },
  INTERNET: { label: "Internet", section: "236(1)(d)", adjustable: true },
  ELECTRICITY: { label: "Electricity bill", section: "235", adjustable: true },
  VEHICLE: { label: "Vehicle (registration / token)", section: "231B / 234", adjustable: true },
  PROPERTY: { label: "Property purchase / sale", section: "236C / 236K", adjustable: true },
  PROFIT_ON_DEBT: { label: "Bank profit", section: "151", adjustable: false },
  OTHER: { label: "Other", section: "", adjustable: true },
} as const;
export type WithholdingTypeValue = keyof typeof WITHHOLDING_TYPES;
export const WITHHOLDING_TYPE_KEYS = Object.keys(WITHHOLDING_TYPES) as [WithholdingTypeValue, ...WithholdingTypeValue[]];

export const TAX_TAGS = {
  DONATION: { label: "Donation (tax credit, s.61)" },
  ZAKAT: { label: "Zakat (deductible, s.60)" },
  PENSION: { label: "Pension / VPS (tax credit, s.63)" },
} as const;
export type TaxTagValue = keyof typeof TAX_TAGS;
export const TAX_TAG_KEYS = Object.keys(TAX_TAGS) as [TaxTagValue, ...TaxTagValue[]];

/** Return and wealth statement deadline for a tax year: 30 September after it ends. */
export function returnDeadline(taxYear: number) {
  return new Date(Date.UTC(taxYear, 8, 30));
}
