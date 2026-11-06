import { type NextRequest, NextResponse } from "next/server";
import { getCurrentUser } from "@/lib/auth/dal";
import { currentYearMonth, parsePeriod } from "@/lib/dates";
import { renderMonthlyReport } from "@/server/reports/monthly-report";

/** GET /api/reports/monthly?period=YYYY-MM: the month's report as a PDF download. */
export async function GET(request: NextRequest) {
  const user = await getCurrentUser();
  if (!user || user.role !== "USER") return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  const parsed = parsePeriod(request.nextUrl.searchParams.get("period"));
  const { year, month } = parsed.kind === "month" ? parsed : currentYearMonth();
  try {
    const { buffer, filename } = await renderMonthlyReport(user.id, year, month);
    return new NextResponse(new Uint8Array(buffer), {
      headers: {
        "Content-Type": "application/pdf",
        "Content-Disposition": `attachment; filename="${filename}"`,
        "Cache-Control": "no-store",
      },
    });
  } catch (error) {
    console.error("report render failed", error);
    return NextResponse.json({ error: "Could not create the report." }, { status: 500 });
  }
}
