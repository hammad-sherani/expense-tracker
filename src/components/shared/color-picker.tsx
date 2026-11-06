"use client";

import { Check } from "lucide-react";
import { COLOR_PRESETS } from "@/lib/category-icons";
import { cn } from "@/lib/utils";

export function ColorPicker({
  value,
  onChange,
  label = "Colour",
}: {
  value: string;
  onChange: (color: string) => void;
  label?: string;
}) {
  return (
    <div role="radiogroup" aria-label={label} className="flex flex-wrap gap-2">
      {COLOR_PRESETS.map((c) => {
        const selected = value.toLowerCase() === c;
        return (
          <button
            key={c}
            type="button"
            role="radio"
            aria-checked={selected}
            aria-label={c}
            onClick={() => onChange(c)}
            className={cn(
              "flex size-7 items-center justify-center rounded-full ring-offset-2 ring-offset-background transition-shadow focus-visible:ring-2 focus-visible:ring-ring focus-visible:outline-none",
              selected && "ring-2 ring-foreground/70",
            )}
            style={{ backgroundColor: c }}
          >
            {selected && <Check className="size-3.5 text-white" />}
          </button>
        );
      })}
    </div>
  );
}
