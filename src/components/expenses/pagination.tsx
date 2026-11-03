"use client";

import { ChevronLeft, ChevronRight } from "lucide-react";
import { usePathname, useSearchParams } from "next/navigation";
import { useNavigationTransition } from "@/components/shared/navigation-transition";
import { Button } from "@/components/ui/button";
import { PAGE_SIZE } from "@/lib/constants";
import { cn } from "@/lib/utils";

/** Page numbers with ellipses, e.g. [1, "…", 4, 5, 6, "…", 12] */
function pageList(page: number, pageCount: number): (number | "…")[] {
  if (pageCount <= 7) return Array.from({ length: pageCount }, (_, i) => i + 1);
  const pages = new Set([1, pageCount, page - 1, page, page + 1]);
  const sorted = [...pages].filter((p) => p >= 1 && p <= pageCount).sort((a, b) => a - b);
  const out: (number | "…")[] = [];
  sorted.forEach((p, i) => {
    if (i > 0 && p - sorted[i - 1] > 1) out.push("…");
    out.push(p);
  });
  return out;
}

export function Pagination({ page, pageCount, total }: { page: number; pageCount: number; total: number }) {
  const pathname = usePathname();
  const searchParams = useSearchParams();
  const { navigate } = useNavigationTransition();

  const goTo = (p: number) => {
    const params = new URLSearchParams(searchParams.toString());
    if (p <= 1) params.delete("page");
    else params.set("page", String(p));
    navigate(`${pathname}?${params.toString()}`);
  };

  const from = total === 0 ? 0 : (page - 1) * PAGE_SIZE + 1;
  const to = Math.min(page * PAGE_SIZE, total);

  return (
    <div className="flex flex-col items-center justify-between gap-3 border-t px-4 py-3 sm:flex-row sm:px-5">
      <p className="text-xs text-muted-foreground tabular-nums">
        Showing <span className="font-medium text-foreground">{from}</span>–
        <span className="font-medium text-foreground">{to}</span> of{" "}
        <span className="font-medium text-foreground">{total}</span>
      </p>
      {pageCount > 1 && (
        <nav className="flex items-center gap-1" aria-label="Pagination">
          <Button variant="ghost" size="icon-sm" disabled={page <= 1} onClick={() => goTo(page - 1)} aria-label="Previous page">
            <ChevronLeft />
          </Button>
          {pageList(page, pageCount).map((p, i) =>
            p === "…" ? (
              <span key={`gap-${i}`} className="px-1 text-xs text-muted-foreground">
                …
              </span>
            ) : (
              <Button
                key={p}
                variant={p === page ? "secondary" : "ghost"}
                size="icon-sm"
                aria-current={p === page ? "page" : undefined}
                onClick={() => goTo(p)}
                className={cn("tabular-nums", p === page && "font-semibold")}
              >
                {p}
              </Button>
            ),
          )}
          <Button
            variant="ghost"
            size="icon-sm"
            disabled={page >= pageCount}
            onClick={() => goTo(page + 1)}
            aria-label="Next page"
          >
            <ChevronRight />
          </Button>
        </nav>
      )}
    </div>
  );
}
