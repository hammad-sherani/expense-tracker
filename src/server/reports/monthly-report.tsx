import "server-only";
import { Document, Page, renderToBuffer, StyleSheet, Text, View } from "@react-pdf/renderer";
import { after } from "next/server";
import { db } from "@/lib/db";
import { currentYearMonth, formatExpenseDate, monthLabel, monthRange, shiftMonth } from "@/lib/dates";
import { escapeHtml, sendEmail } from "@/lib/email";
import { roundMoney } from "@/lib/format";
import { type BudgetStatus, getBudgetStatus } from "@/server/budgets";
import { getDuesSummary } from "@/server/queries/dues";
import { toCategoryDTO } from "@/server/queries/expenses";

type ReportData = {
  username: string;
  label: string;
  spent: number;
  income: number;
  saved: number;
  previousSpent: number;
  count: number;
  categories: { name: string; color: string; total: number; percent: number }[];
  budgets: BudgetStatus[];
  top: { date: string; description: string; category: string; amount: number }[];
  dues: { owedToMe: number; iOwe: number };
};

// Built-in PDF fonts can't draw "Rs." with locale-specific characters, so format plainly.
const money = (n: number) => `${n < 0 ? "-" : ""}Rs. ${Math.abs(n).toLocaleString("en-US", { maximumFractionDigits: 2 })}`;

export async function getReportData(userId: string, year: number, month: number): Promise<ReportData> {
  const range = monthRange(year, month);
  const prev = shiftMonth(year, month, -1);
  const prevRange = monthRange(prev.year, prev.month);
  const where = { userId, date: { gte: range.start, lt: range.end } };
  const [user, expenses, incomeAgg, prevAgg, budgets, dues] = await Promise.all([
    db.user.findUniqueOrThrow({ where: { id: userId }, select: { username: true } }),
    db.expense.findMany({
      where,
      orderBy: { amount: "desc" },
      select: {
        amount: true,
        date: true,
        description: true,
        legacyCategory: true,
        category: { select: { id: true, name: true, icon: true, color: true, archivedAt: true } },
      },
    }),
    db.income.aggregate({ where, _sum: { amount: true } }),
    db.expense.aggregate({ where: { userId, date: { gte: prevRange.start, lt: prevRange.end } }, _sum: { amount: true } }),
    getBudgetStatus(userId, year, month),
    getDuesSummary(userId),
  ]);

  const spent = roundMoney(expenses.reduce((a, e) => a + e.amount, 0));
  const income = roundMoney(incomeAgg._sum.amount ?? 0);
  const byCat = new Map<string, { name: string; color: string; total: number }>();
  for (const e of expenses) {
    const c = toCategoryDTO(e.category, e.legacyCategory);
    const k = c.id || c.name;
    const cur = byCat.get(k) ?? { name: c.name, color: c.color, total: 0 };
    cur.total += e.amount;
    byCat.set(k, cur);
  }
  return {
    username: user.username,
    label: monthLabel(year, month),
    spent,
    income,
    saved: roundMoney(income - spent),
    previousSpent: roundMoney(prevAgg._sum.amount ?? 0),
    count: expenses.length,
    categories: [...byCat.values()]
      .map((c) => ({ ...c, total: roundMoney(c.total), percent: spent > 0 ? (c.total / spent) * 100 : 0 }))
      .sort((a, b) => b.total - a.total),
    budgets,
    top: expenses.slice(0, 10).map((e) => ({
      date: formatExpenseDate(e.date, { day: "numeric", month: "short" }),
      description: e.description,
      category: toCategoryDTO(e.category, e.legacyCategory).name,
      amount: e.amount,
    })),
    dues: { owedToMe: dues.owedToMe, iOwe: dues.iOwe },
  };
}

const INK = "#1f2133";
const MUTED = "#6b7080";
const LINE = "#e5e7eb";
const ACCENT = "#3b4bd8";

const s = StyleSheet.create({
  page: { padding: 36, fontSize: 10, color: INK, fontFamily: "Helvetica" },
  brand: { fontSize: 10, color: ACCENT, fontFamily: "Helvetica-Bold", marginBottom: 4 },
  h1: { fontSize: 20, fontFamily: "Helvetica-Bold" },
  sub: { color: MUTED, marginTop: 2 },
  stats: { flexDirection: "row", gap: 8, marginTop: 18 },
  stat: { flex: 1, borderWidth: 1, borderColor: LINE, borderRadius: 6, padding: 10 },
  statLabel: { color: MUTED, fontSize: 8, textTransform: "uppercase" },
  statValue: { fontSize: 14, fontFamily: "Helvetica-Bold", marginTop: 4 },
  h2: { fontSize: 12, fontFamily: "Helvetica-Bold", marginTop: 20, marginBottom: 8 },
  row: { flexDirection: "row", alignItems: "center", paddingVertical: 4, borderBottomWidth: 1, borderBottomColor: LINE },
  cellGrow: { flex: 1 },
  cellRight: { width: 90, textAlign: "right" },
  cellSmall: { width: 50, color: MUTED },
  dot: { width: 7, height: 7, borderRadius: 4, marginRight: 6 },
  barTrack: { width: 110, height: 5, backgroundColor: "#f1f2f6", borderRadius: 3, marginHorizontal: 8 },
  muted: { color: MUTED },
  footer: { position: "absolute", bottom: 24, left: 36, right: 36, color: MUTED, fontSize: 8, flexDirection: "row", justifyContent: "space-between" },
});

function Stat({ label, value }: { label: string; value: string }) {
  return (
    <View style={s.stat}>
      <Text style={s.statLabel}>{label}</Text>
      <Text style={s.statValue}>{value}</Text>
    </View>
  );
}

function MonthlyReport({ d }: { d: ReportData }) {
  const change = d.previousSpent > 0 ? ((d.spent - d.previousSpent) / d.previousSpent) * 100 : null;
  return (
    <Document title={`Spendwise report - ${d.label}`} author="Spendwise">
      <Page size="A4" style={s.page}>
        <Text style={s.brand}>SPENDWISE</Text>
        <Text style={s.h1}>{d.label} report</Text>
        <Text style={s.sub}>
          Prepared for {d.username} - {d.count} expense{d.count === 1 ? "" : "s"}
          {change !== null ? ` - spending ${change >= 0 ? "up" : "down"} ${Math.abs(change).toFixed(1)}% vs last month` : ""}
        </Text>

        <View style={s.stats}>
          <Stat label="Spent" value={money(d.spent)} />
          <Stat label="Income" value={money(d.income)} />
          <Stat label={d.saved >= 0 ? "Saved" : "Overspent"} value={money(Math.abs(d.saved))} />
          <Stat label="Savings rate" value={d.income > 0 ? `${((d.saved / d.income) * 100).toFixed(1)}%` : "-"} />
        </View>

        <Text style={s.h2}>Spending by category</Text>
        {d.categories.length === 0 ? (
          <Text style={s.muted}>No expenses this month.</Text>
        ) : (
          d.categories.map((c) => (
            <View key={c.name} style={s.row} wrap={false}>
              <View style={[s.dot, { backgroundColor: c.color }]} />
              <Text style={s.cellGrow}>{c.name}</Text>
              <View style={s.barTrack}>
                <View style={{ width: `${Math.max(2, c.percent)}%`, height: 5, backgroundColor: ACCENT, borderRadius: 3 }} />
              </View>
              <Text style={s.cellSmall}>{c.percent.toFixed(1)}%</Text>
              <Text style={s.cellRight}>{money(c.total)}</Text>
            </View>
          ))
        )}

        {d.budgets.length > 0 && (
          <>
            <Text style={s.h2}>Budgets</Text>
            {d.budgets.map((b) => (
              <View key={b.id} style={s.row} wrap={false}>
                <Text style={s.cellGrow}>{b.category?.name ?? "All spending"}</Text>
                <Text style={[s.cellSmall, { width: 60, color: b.level === "over" ? "#dc2626" : b.level === "warn" ? "#d97706" : "#16a34a" }]}>
                  {Math.round(b.percent)}% used
                </Text>
                <Text style={s.cellRight}>
                  {money(b.spent)} / {money(b.amount)}
                </Text>
              </View>
            ))}
          </>
        )}

        <Text style={s.h2}>Biggest expenses</Text>
        {d.top.length === 0 ? (
          <Text style={s.muted}>None.</Text>
        ) : (
          d.top.map((e, i) => (
            <View key={i} style={s.row} wrap={false}>
              <Text style={s.cellSmall}>{e.date}</Text>
              <Text style={s.cellGrow}>{e.description}</Text>
              <Text style={[s.cellSmall, { width: 90 }]}>{e.category}</Text>
              <Text style={s.cellRight}>{money(e.amount)}</Text>
            </View>
          ))
        )}

        <Text style={s.h2}>Dues (today)</Text>
        <View style={s.row}>
          <Text style={s.cellGrow}>Owed to you</Text>
          <Text style={s.cellRight}>{money(d.dues.owedToMe)}</Text>
        </View>
        <View style={s.row}>
          <Text style={s.cellGrow}>You owe</Text>
          <Text style={s.cellRight}>{money(d.dues.iOwe)}</Text>
        </View>

        <View style={s.footer} fixed>
          <Text>Spendwise - personal expense tracker</Text>
          <Text render={({ pageNumber, totalPages }) => `Page ${pageNumber} of ${totalPages}`} />
        </View>
      </Page>
    </Document>
  );
}

export async function renderMonthlyReport(userId: string, year: number, month: number) {
  const data = await getReportData(userId, year, month);
  const buffer = await renderToBuffer(<MonthlyReport d={data} />);
  return { buffer, data, filename: `spendwise-report-${year}-${String(month).padStart(2, "0")}.pdf` };
}

export async function emailMonthlyReport(user: { id: string; email: string }, year: number, month: number) {
  const { buffer, data, filename } = await renderMonthlyReport(user.id, year, month);
  const title = `Your Spendwise report for ${data.label}`;
  const lines = [
    `Hi ${data.username},`,
    `You spent ${money(data.spent)} in ${data.label}${data.income > 0 ? ` and saved ${money(data.saved)}` : ""}.`,
    "Your full report is attached as a PDF.",
  ];
  await sendEmail({
    to: user.email,
    subject: title,
    text: lines.join("\n\n"),
    html: `<div style="font-family:Segoe UI,Helvetica,Arial,sans-serif;max-width:480px;margin:0 auto;padding:32px 24px;color:#1f2133">
      <p style="font-size:18px;font-weight:600;margin:0 0 16px">${escapeHtml(title)}</p>
      ${lines.map((l) => `<p style="margin:0 0 12px;color:#555a6e">${escapeHtml(l)}</p>`).join("")}</div>`,
    attachments: [{ filename, content: buffer, contentType: "application/pdf" }],
  });
}

/**
 * When a month has ended and the user turned on monthly emails, send last
 * month's report once (runs after the response, on their first visit).
 */
export async function scheduleMonthlyReport(user: { id: string; email: string }) {
  const now = currentYearMonth();
  const last = shiftMonth(now.year, now.month, -1);
  const key = `${last.year}-${String(last.month).padStart(2, "0")}`;
  // Claim the month atomically so parallel requests don't send it twice.
  const claimed = await db.user.updateMany({
    where: {
      id: user.id,
      monthlyReportEmail: true,
      OR: [{ lastReportMonth: null }, { lastReportMonth: { isSet: false } }, { lastReportMonth: { not: key } }],
    },
    data: { lastReportMonth: key },
  });
  if (claimed.count === 0) return;
  after(async () => {
    try {
      await emailMonthlyReport(user, last.year, last.month);
    } catch (e) {
      console.error("monthly report email failed", e);
      // Let the next visit try again.
      await db.user.update({ where: { id: user.id }, data: { lastReportMonth: null } }).catch(() => {});
    }
  });
}
