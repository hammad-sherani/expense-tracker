import type { NextRequest } from "next/server";
import { getCurrentUser } from "@/lib/auth/dal";
import { PAYMENT_METHOD_LABELS } from "@/lib/constants";
import { parsePeriod, periodToParam } from "@/lib/dates";
import { parseExpenseListParams } from "@/lib/validations/expense";
import { exportExpenses } from "@/server/queries/expenses";

function csvCell(value: string | number | null | undefined): string {
  if (value === null || value === undefined) return "";
  let s = String(value);
  // Neutralise spreadsheet formula injection.
  if (/^[=+\-@\t\r]/.test(s)) s = `'${s}`;
  return /[",\r\n]/.test(s) ? `"${s.replace(/"/g, '""')}"` : s;
}

export async function GET(request: NextRequest) {
  const user = await getCurrentUser();
  if (!user || user.role !== "USER") {
    return Response.json({ error: "Unauthorized" }, { status: 401 });
  }

  const sp = Object.fromEntries(request.nextUrl.searchParams.entries());
  const period = parsePeriod(sp.period);
  const params = parseExpenseListParams(sp);

  try {
    const expenses = await exportExpenses(user.id, period, params);

    const header = [
      "Date",
      "Description",
      "Category",
      "Amount (PKR)",
      "Split total (PKR)",
      "Paid by",
      "Wallet",
      "Notes",
      "Created At",
      "Updated At",
    ];
    const lines = expenses.map((e) =>
      [
        e.date,
        e.description,
        e.category.name,
        e.amount.toFixed(2),
        e.split ? e.split.total.toFixed(2) : "",
        e.split ? (e.split.paidBy?.name ?? "Me") : "",
        e.wallet ? e.wallet.name : e.paymentMethod ? PAYMENT_METHOD_LABELS[e.paymentMethod] : "",
        e.notes,
        e.createdAt,
        e.updatedAt,
      ]
        .map(csvCell)
        .join(","),
    );

    // BOM so Excel opens UTF-8 correctly.
    const body = "﻿" + [header.join(","), ...lines].join("\r\n");
    const filename = `expenses-${periodToParam(period)}.csv`;

    return new Response(body, {
      headers: {
        "Content-Type": "text/csv; charset=utf-8",
        "Content-Disposition": `attachment; filename="${filename}"`,
        "Cache-Control": "no-store",
      },
    });
  } catch (error) {
    console.error("CSV export failed", error);
    return Response.json({ error: "Failed to export expenses." }, { status: 500 });
  }
}
