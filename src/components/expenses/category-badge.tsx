import { createElement } from "react";
import { categoryIcon } from "@/lib/category-icons";
import { cn } from "@/lib/utils";

type CategoryLike = { name: string; icon: string; color: string };

export function CategoryIcon({
  category,
  className,
  size = "md",
}: {
  category: CategoryLike;
  className?: string;
  size?: "sm" | "md" | "lg";
}) {
  return (
    <span
      className={cn(
        "inline-flex shrink-0 items-center justify-center rounded-lg",
        size === "sm" && "size-7 [&_svg]:size-3.5",
        size === "md" && "size-9 [&_svg]:size-4",
        size === "lg" && "size-12 rounded-xl [&_svg]:size-6",
        className,
      )}
      style={{ backgroundColor: `${category.color}1a`, color: category.color }}
      aria-hidden
    >
      {createElement(categoryIcon(category.icon))}
    </span>
  );
}

export function CategoryBadge({ category, className }: { category: CategoryLike; className?: string }) {
  return (
    <span
      className={cn(
        "inline-flex max-w-full items-center gap-1.5 rounded-full px-2.5 py-0.5 text-xs font-medium whitespace-nowrap text-foreground/80",
        className,
      )}
      style={{ backgroundColor: `${category.color}1f` }}
    >
      <span className="size-1.5 shrink-0 rounded-full" style={{ backgroundColor: category.color }} />
      <span className="truncate">{category.name}</span>
    </span>
  );
}
