"use client";

import { usePathname, useSearchParams } from "next/navigation";
import { useNavigationTransition } from "@/components/shared/navigation-transition";
import { cn } from "@/lib/utils";

function Segmented<T extends string>({
  label,
  value,
  options,
  onChange,
}: {
  label: string;
  value: T;
  options: { value: T; label: string }[];
  onChange: (v: T) => void;
}) {
  return (
    <div className="inline-flex rounded-lg bg-muted p-0.5" role="group" aria-label={label}>
      {options.map((o) => (
        <button
          key={o.value}
          type="button"
          aria-pressed={value === o.value}
          onClick={() => onChange(o.value)}
          className={cn(
            "rounded-md px-3 py-1.5 text-xs font-medium transition-colors",
            value === o.value ? "bg-background text-foreground shadow-xs" : "text-muted-foreground hover:text-foreground",
          )}
        >
          {o.label}
        </button>
      ))}
    </div>
  );
}

export function DuesFilters({ dir, status }: { dir: "owed" | "owe"; status: "pending" | "settled" | "all" }) {
  const pathname = usePathname();
  const searchParams = useSearchParams();
  const { navigate } = useNavigationTransition();

  const set = (key: string, value: string, fallback: string) => {
    const params = new URLSearchParams(searchParams.toString());
    if (value === fallback) params.delete(key);
    else params.set(key, value);
    const qs = params.toString();
    navigate(qs ? `${pathname}?${qs}` : pathname);
  };

  return (
    <div className="flex flex-wrap items-center gap-2">
      <Segmented
        label="Direction"
        value={dir}
        onChange={(v) => set("dir", v, "owed")}
        options={[
          { value: "owed", label: "Owed to me" },
          { value: "owe", label: "I owe" },
        ]}
      />
      <Segmented
        label="Status"
        value={status}
        onChange={(v) => set("status", v, "pending")}
        options={[
          { value: "pending", label: "Pending" },
          { value: "settled", label: "Settled" },
          { value: "all", label: "All" },
        ]}
      />
    </div>
  );
}
