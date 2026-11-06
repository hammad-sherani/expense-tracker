"use server";

import { requireUser } from "@/lib/auth/dal";
import { parsePeriod } from "@/lib/dates";
import { emailMonthlyReport } from "@/server/reports/monthly-report";
import type { ActionResult } from "@/types";

export async function emailReport(period: string): Promise<ActionResult> {
  const user = await requireUser();
  const parsed = parsePeriod(period);
  if (parsed.kind !== "month") return { ok: false, error: "Choose a month first." };
  try {
    await emailMonthlyReport(user, parsed.year, parsed.month);
    return { ok: true, data: undefined, message: `Report sent to ${user.email}` };
  } catch (e) {
    console.error("email report failed", e);
    return { ok: false, error: "Couldn't email the report. Please try again." };
  }
}
