/** Salaried income tax estimate. Pure, so it runs on the server, in the browser and in tests. */
import type { Slab, TaxRules } from "./tax-rates";

const money = (n: number) => Math.round((n + Number.EPSILON) * 100) / 100;

/** Tax on `income` from the slab table. */
export function slabTax(slabs: Slab[], income: number) {
  let slab = slabs[0];
  for (const s of slabs) if (income > s.over) slab = s;
  return money(slab.fixed + Math.max(0, income - slab.over) * slab.rate);
}

export type TaxInput = {
  /** Salary recorded so far in the tax year. */
  salaryToDate: number;
  /** Salary still expected this tax year. */
  salaryProjected: number;
  zakat: number;
  donations: number;
  pension: number;
  /** Tax already deducted that counts against this year's tax. */
  adjustableWithheld: number;
  /** Months left to save for what's still owed (0 = due now). */
  monthsLeft: number;
};

export function estimateTax(rules: TaxRules, i: TaxInput) {
  const salary = money(i.salaryToDate + i.salaryProjected);
  const zakatDeduction = money(Math.min(i.zakat, salary));
  const taxable = money(Math.max(0, salary - zakatDeduction));
  const normal = slabTax(rules.slabs, taxable);
  const surcharge = rules.surcharge && taxable > rules.surcharge.over ? money(normal * rules.surcharge.rate) : 0;
  const gross = money(normal + surcharge);
  // Credits are given at the average rate of tax on the eligible amount.
  const avgRate = taxable > 0 ? gross / taxable : 0;
  const donationEligible = Math.min(i.donations, taxable * rules.donationCap);
  const pensionEligible = Math.min(i.pension, taxable * rules.pensionCap);
  const donationCredit = money(avgRate * donationEligible);
  const pensionCredit = money(avgRate * pensionEligible);
  const credits = money(Math.min(gross, donationCredit + pensionCredit));
  const tax = money(gross - credits);
  const balance = money(tax - i.adjustableWithheld);
  return {
    salary,
    zakatDeduction,
    taxable,
    normal,
    surcharge,
    gross,
    avgRatePct: money(avgRate * 100),
    donationCredit,
    pensionCredit,
    credits,
    tax,
    withheld: money(i.adjustableWithheld),
    /** + still to pay, − refund due. */
    balance,
    /** Whole rupees, rounded up so the total is covered. */
    monthlySetAside: balance > 0 ? Math.ceil(balance / Math.max(1, i.monthsLeft)) : 0,
  };
}
