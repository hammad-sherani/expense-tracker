"use client";

import { FileDown, Loader2, Mail } from "lucide-react";
import { useTransition } from "react";
import { toast } from "sonner";
import { Button } from "@/components/ui/button";
import { emailReport } from "@/server/actions/reports";

/** Download the month's PDF report, or email it to yourself. */
export function ReportButtons({ period }: { period: string }) {
  const [isPending, startTransition] = useTransition();
  return (
    <>
      <Button asChild variant="outline">
        <a href={`/api/reports/monthly?period=${encodeURIComponent(period)}`} download>
          <FileDown />
          PDF report
        </a>
      </Button>
      <Button
        variant="outline"
        size="icon"
        aria-label="Email me this report"
        title="Email me this report"
        disabled={isPending}
        onClick={() =>
          startTransition(async () => {
            const r = await emailReport(period);
            if (r.ok) toast.success(r.message);
            else toast.error(r.error);
          })
        }
      >
        {isPending ? <Loader2 className="animate-spin" /> : <Mail />}
      </Button>
    </>
  );
}
