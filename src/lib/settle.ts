/**
 * "Who pays whom" with as few payments as possible (greedy: the biggest debtor
 * pays the biggest creditor until everyone is even). Works in paisa.
 */

export type Transfer = { from: string; to: string; amount: number };

/** `balances`: person -> paid minus share (positive = should get money back). */
export function settlePlan(balances: Map<string, number>): Transfer[] {
  const creditors: { id: string; paisa: number }[] = [];
  const debtors: { id: string; paisa: number }[] = [];
  for (const [id, balance] of balances) {
    const paisa = Math.round(balance * 100);
    if (paisa > 0) creditors.push({ id, paisa });
    else if (paisa < 0) debtors.push({ id, paisa: -paisa });
  }
  creditors.sort((a, b) => b.paisa - a.paisa || a.id.localeCompare(b.id));
  debtors.sort((a, b) => b.paisa - a.paisa || a.id.localeCompare(b.id));

  const out: Transfer[] = [];
  let i = 0;
  let j = 0;
  while (i < debtors.length && j < creditors.length) {
    const pay = Math.min(debtors[i].paisa, creditors[j].paisa);
    if (pay > 0) out.push({ from: debtors[i].id, to: creditors[j].id, amount: pay / 100 });
    debtors[i].paisa -= pay;
    creditors[j].paisa -= pay;
    if (debtors[i].paisa === 0) i++;
    if (creditors[j].paisa === 0) j++;
  }
  return out;
}
