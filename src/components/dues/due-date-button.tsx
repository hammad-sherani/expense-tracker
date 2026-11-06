"use client";

import { CalendarClock, Loader2 } from "lucide-react";
import { useState, useTransition } from "react";
import { toast } from "sonner";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Popover, PopoverContent, PopoverTrigger } from "@/components/ui/popover";
import { formatExpenseDate } from "@/lib/dates";
import { cn } from "@/lib/utils";
import { setDueDate } from "@/server/actions/dues";
import type { DueDTO } from "@/types";

/** Shows a due's "pay back by" date and lets the user set, change or clear it. */
export function DueDateButton({ due }: { due: DueDTO }) {
  const [open, setOpen] = useState(false);
  const [value, setValue] = useState(due.dueDate ?? "");
  const [isPending, startTransition] = useTransition();

  const save = (date: string) =>
    startTransition(async () => {
      const r = await setDueDate(due.id, date);
      if (r.ok) {
        toast.success(r.message);
        setOpen(false);
      } else toast.error(r.error);
    });

  return (
    <Popover
      open={open}
      onOpenChange={(o) => {
        setOpen(o);
        if (o) setValue(due.dueDate ?? "");
      }}
    >
      <PopoverTrigger asChild>
        <button
          type="button"
          className={cn(
            "inline-flex items-center gap-1 rounded px-1 text-xs hover:text-foreground",
            due.overdue ? "font-medium text-destructive" : "text-muted-foreground",
          )}
          aria-label={due.dueDate ? `Pay back by ${formatExpenseDate(due.dueDate)}. Change date` : "Set a pay back date"}
        >
          <CalendarClock className="size-3" />
          {due.dueDate
            ? `${due.overdue ? "Overdue · was due" : "Due"} ${formatExpenseDate(due.dueDate, { day: "numeric", month: "short" })}`
            : "Set due date"}
        </button>
      </PopoverTrigger>
      <PopoverContent className="w-64" align="start">
        <form
          className="flex flex-col gap-3"
          onSubmit={(e) => {
            e.preventDefault();
            save(value);
          }}
        >
          <label htmlFor={`due-date-${due.id}`} className="text-sm font-medium">
            Pay back by
          </label>
          <Input id={`due-date-${due.id}`} type="date" value={value} onChange={(e) => setValue(e.target.value)} />
          <div className="flex justify-between gap-2">
            {due.dueDate ? (
              <Button type="button" size="sm" variant="ghost" disabled={isPending} onClick={() => save("")}>
                Clear
              </Button>
            ) : (
              <span />
            )}
            <Button type="submit" size="sm" disabled={isPending || !value}>
              {isPending && <Loader2 className="animate-spin" />}
              Save
            </Button>
          </div>
        </form>
      </PopoverContent>
    </Popover>
  );
}
