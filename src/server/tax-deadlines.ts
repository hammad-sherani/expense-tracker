import "server-only";
import { after } from "next/server";
import { db } from "@/lib/db";
import { addDays, diffInDays, formatExpenseDate, toDateInput, todayUTC } from "@/lib/dates";
import { noticeEmail, sendEmail } from "@/lib/email";
import { returnDeadline } from "@/lib/tax-rates";
import { taxYearLabel, taxYearOf } from "@/lib/tax-year";

export type DeadlineDTO = {
  /** Stable id for the reminder email log. */
  key: string;
  title: string;
  detail: string;
  /** "YYYY-MM-DD" */
  date: string;
  daysUntil: number;
  kind: "tax" | "reminder";
  reminderId: string | null;
  yearly: boolean;
  notes: string | null;
};

/** How far ahead deadlines show on the dashboard. */
export const DEADLINE_WINDOW = 30;

/** Next yearly occurrence on or after `today` (29 Feb falls back to 28 Feb). */
function nextYearly(date: Date, today: Date) {
  for (let y = today.getUTCFullYear(); ; y++) {
    const last = new Date(Date.UTC(y, date.getUTCMonth() + 1, 0)).getUTCDate();
    const d = new Date(Date.UTC(y, date.getUTCMonth(), Math.min(date.getUTCDate(), last)));
    if (d >= today) return d;
  }
}

/** The return / wealth statement deadline still ahead, and the user's own reminders, soonest first. */
export async function listDeadlines(userId: string): Promise<DeadlineDTO[]> {
  const today = todayUTC();
  const reminders = await db.reminder.findMany({ where: { userId }, orderBy: { date: "asc" } });
  // The return for the tax year that ended last June is due 30 Sept; after that, next year's.
  let ty = taxYearOf(today) - 1;
  if (returnDeadline(ty) < today) ty += 1;
  const due = returnDeadline(ty);
  const items: DeadlineDTO[] = [
    {
      key: `return:${ty}`,
      title: `Income tax return & wealth statement (${taxYearLabel(ty, true)})`,
      detail: `For ${taxYearLabel(ty)}. File on FBR IRIS. FBR often extends this date, so check FBR.`,
      date: toDateInput(due),
      daysUntil: diffInDays(today, due),
      kind: "tax",
      reminderId: null,
      yearly: true,
      notes: null,
    },
    ...reminders.map((r) => {
      const date = r.yearly ? nextYearly(r.date, today) : r.date;
      return {
        key: `reminder:${r.id}:${toDateInput(date)}`,
        title: r.title,
        detail: r.yearly ? "Every year" : "Once",
        date: toDateInput(date),
        daysUntil: diffInDays(today, date),
        kind: "reminder" as const,
        reminderId: r.id,
        yearly: r.yearly,
        notes: r.notes,
      };
    }),
  ];
  return items.sort((a, b) => a.date.localeCompare(b.date));
}

/** Deadlines worth showing now: upcoming within the window, or a one-off reminder up to a week late. */
export function soonDeadlines(list: DeadlineDTO[]) {
  return list.filter((d) => d.daysUntil <= DEADLINE_WINDOW && d.daysUntil >= -7);
}

/**
 * Emails a reminder 14 days and 3 days before each deadline, once each (claimed in
 * ReminderLog first so parallel visits don't send it twice). Runs after the response.
 */
export async function scheduleDeadlineEmails(user: { id: string; email: string }) {
  const list = await listDeadlines(user.id);
  const today = todayUTC();
  const due = list.flatMap((d) => {
    const kind = d.daysUntil >= 0 && d.daysUntil <= 3 ? "3d" : d.daysUntil > 3 && d.daysUntil <= 14 ? "14d" : null;
    return kind ? [{ d, kind }] : [];
  });
  if (due.length === 0) return;
  after(async () => {
    const sent = await db.reminderLog.findMany({ where: { userId: user.id, key: { in: due.map((x) => x.d.key) } }, select: { key: true, kind: true } });
    for (const { d, kind } of due) {
      if (sent.some((s) => s.key === d.key && s.kind === kind)) continue;
      try {
        await db.reminderLog.create({ data: { userId: user.id, key: d.key, kind } });
      } catch {
        continue; // another request claimed it a moment ago (unique key)
      }
      try {
        const when = d.daysUntil === 0 ? "today" : `on ${formatExpenseDate(addDays(today, d.daysUntil), { day: "numeric", month: "long", year: "numeric" })}`;
        const mail = noticeEmail(`${d.title} is due ${when}`, [d.detail, ...(d.notes ? [d.notes] : []), "Open Spendwise → Tax to see the details."]);
        await sendEmail({ ...mail, to: user.email });
      } catch (e) {
        console.error("deadline email failed", e);
        await db.reminderLog.deleteMany({ where: { userId: user.id, key: d.key, kind } }).catch(() => {});
      }
    }
  });
}
