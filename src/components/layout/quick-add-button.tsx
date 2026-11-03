"use client";

import { Plus } from "lucide-react";
import { useEffect } from "react";
import { useExpenseUI } from "@/components/expenses/expense-dialogs";
import { Button } from "@/components/ui/button";
import { cn } from "@/lib/utils";

export function QuickAddButton({ className, compact = false }: { className?: string; compact?: boolean }) {
  const { openCreate } = useExpenseUI();
  return (
    <Button onClick={openCreate} className={cn(compact ? "" : "h-9", className)} size={compact ? "icon" : "default"} aria-label="Quick add expense">
      <Plus />
      {!compact && "Quick Add"}
    </Button>
  );
}

/** Global "N" keyboard shortcut to open the quick-add dialog. */
export function QuickAddShortcut() {
  const { openCreate } = useExpenseUI();
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if (e.key.toLowerCase() !== "n" || e.metaKey || e.ctrlKey || e.altKey) return;
      const target = e.target as HTMLElement | null;
      if (target?.closest("input, textarea, select, [contenteditable=true], [role=dialog]")) return;
      e.preventDefault();
      openCreate();
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [openCreate]);
  return null;
}
