import { CATEGORY_META, type CategoryValue } from "@/lib/constants";
import { cn } from "@/lib/utils";

export function CategoryIcon({
  category,
  className,
  size = "md",
}: {
  category: CategoryValue;
  className?: string;
  size?: "sm" | "md" | "lg";
}) {
  const meta = CATEGORY_META[category];
  const Icon = meta.icon;
  return (
    <span
      className={cn(
        "inline-flex shrink-0 items-center justify-center rounded-lg",
        size === "sm" && "size-7 [&_svg]:size-3.5",
        size === "md" && "size-9 [&_svg]:size-4",
        size === "lg" && "size-12 rounded-xl [&_svg]:size-6",
        className,
      )}
      style={{ backgroundColor: `${meta.color}1a`, color: meta.color }}
      aria-hidden
    >
      <Icon />
    </span>
  );
}

export function CategoryBadge({ category, className }: { category: CategoryValue; className?: string }) {
  const meta = CATEGORY_META[category];
  return (
    <span
      className={cn(
        "inline-flex items-center gap-1.5 rounded-full px-2.5 py-0.5 text-xs font-medium whitespace-nowrap text-foreground/80",
        className,
      )}
      style={{ backgroundColor: `${meta.color}1f` }}
    >
      <span className="size-1.5 rounded-full" style={{ backgroundColor: meta.color }} />
      {meta.label}
    </span>
  );
}
