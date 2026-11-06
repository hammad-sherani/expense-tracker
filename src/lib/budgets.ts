/** Key used for the overall (all spending) budget in pickers. */
export const OVERALL_BUDGET = "__overall__";

/** Category ids (or OVERALL_BUDGET) that already have a budget. Usable on server and client. */
export function takenKeys(budgets: { category: { id: string } | null }[]) {
  return budgets.map((b) => b.category?.id ?? OVERALL_BUDGET);
}
