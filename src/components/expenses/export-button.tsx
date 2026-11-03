import { Download } from "lucide-react";
import { Button } from "@/components/ui/button";

/** Downloads a CSV of the expenses matching the given search params. */
export function ExportButton({ params, label = "Export CSV" }: { params: Record<string, string | undefined>; label?: string }) {
  const qs = new URLSearchParams();
  for (const [k, v] of Object.entries(params)) if (v) qs.set(k, v);
  return (
    <Button variant="outline" asChild>
      <a href={`/api/expenses/export?${qs.toString()}`} download>
        <Download />
        {label}
      </a>
    </Button>
  );
}
