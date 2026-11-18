"use client";

import { ChevronDown, Search, X } from "lucide-react";
import { usePathname, useSearchParams } from "next/navigation";
import { useEffect, useRef, useState } from "react";
import { useNavigationTransition } from "@/components/shared/navigation-transition";
import { Button } from "@/components/ui/button";
import { Checkbox } from "@/components/ui/checkbox";
import { Input } from "@/components/ui/input";
import { Popover, PopoverContent, PopoverTrigger } from "@/components/ui/popover";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { categoryIcon } from "@/lib/category-icons";
import { DEFAULT_SORT, SORT_OPTIONS } from "@/lib/constants";
import type { CategoryDTO, WalletDTO } from "@/types";

const ALL = "__all__";

/**
 * Tick the categories to show. Untick one or two to see everything else; "Only" shows just one.
 * Saved in the URL as `category` (just one) or `exclude` (the unticked ones).
 */
function CategoryFilter({
  categories,
  category,
  exclude,
  onChange,
}: {
  categories: CategoryDTO[];
  category?: string;
  exclude: string[];
  onChange: (next: { category?: string; exclude?: string[] }) => void;
}) {
  const shown = (id: string) => (category ? id === category : !exclude.includes(id));
  const shownCount = categories.filter((c) => shown(c.id)).length;

  const apply = (ids: Set<string>) => {
    if (ids.size === 0) return; // keep at least one
    if (ids.size === categories.length) onChange({});
    else if (ids.size === 1) onChange({ category: [...ids][0] });
    else onChange({ exclude: categories.filter((c) => !ids.has(c.id)).map((c) => c.id) });
  };
  const toggle = (id: string) => {
    const ids = new Set(categories.filter((c) => shown(c.id)).map((c) => c.id));
    if (ids.has(id)) ids.delete(id);
    else ids.add(id);
    apply(ids);
  };

  const hidden = categories.filter((c) => !shown(c.id));
  const label = category
    ? (categories.find((c) => c.id === category)?.name ?? "1 category")
    : hidden.length === 0
      ? "All categories"
      : hidden.length === 1
        ? `Without ${hidden[0].name}`
        : `Without ${hidden.length} categories`;

  return (
    <Popover>
      <PopoverTrigger asChild>
        <Button
          variant="outline"
          className="w-full justify-between font-normal md:w-48"
          aria-label={`Filter by category: ${label}`}
        >
          <span className="truncate">{label}</span>
          <ChevronDown className="opacity-50" />
        </Button>
      </PopoverTrigger>
      <PopoverContent align="start" className="w-64 p-0">
        <div className="flex items-center justify-between border-b px-3 py-2">
          <p className="text-xs text-muted-foreground">Untick what you don&apos;t want to see</p>
          {shownCount < categories.length && (
            <Button variant="ghost" size="sm" className="h-7 px-2 text-xs" onClick={() => onChange({})}>
              Show all
            </Button>
          )}
        </div>
        <ul className="max-h-72 overflow-y-auto py-1" aria-label="Categories">
          {categories.map((c) => {
            const Icon = categoryIcon(c.icon);
            const checked = shown(c.id);
            const last = checked && shownCount === 1;
            return (
              <li key={c.id} className="group flex items-center gap-2 px-3 py-1.5 hover:bg-muted/60">
                <Checkbox
                  id={`cat-filter-${c.id}`}
                  checked={checked}
                  disabled={last}
                  onCheckedChange={() => toggle(c.id)}
                />
                <label htmlFor={`cat-filter-${c.id}`} className="flex min-w-0 flex-1 cursor-pointer items-center gap-2 text-sm">
                  <Icon className="size-4 shrink-0" style={{ color: c.color }} />
                  <span className="truncate">{c.name}</span>
                  {c.archived && <span className="text-xs text-muted-foreground">(archived)</span>}
                </label>
                <button
                  type="button"
                  className="rounded px-1.5 text-xs text-muted-foreground hover:text-foreground focus-visible:opacity-100 md:opacity-0 md:group-hover:opacity-100"
                  aria-label={`Show only ${c.name}`}
                  onClick={() => onChange({ category: c.id })}
                >
                  Only
                </button>
              </li>
            );
          })}
        </ul>
      </PopoverContent>
    </Popover>
  );
}

export function ExpenseFilters({
  q,
  category,
  exclude = [],
  wallet,
  sort,
  categories,
  wallets,
}: {
  q: string;
  category?: string;
  /** Categories left out of the list. */
  exclude?: string[];
  wallet?: string;
  sort: string;
  categories: CategoryDTO[];
  wallets: WalletDTO[];
}) {
  const pathname = usePathname();
  const searchParams = useSearchParams();
  const { navigate } = useNavigationTransition();
  const [search, setSearch] = useState(q);
  const lastPushed = useRef(q);

  const update = (changes: Record<string, string | undefined>, replace = false) => {
    const params = new URLSearchParams(searchParams.toString());
    for (const [k, v] of Object.entries(changes)) {
      if (v) params.set(k, v);
      else params.delete(k);
    }
    params.delete("page");
    const qs = params.toString();
    navigate(qs ? `${pathname}?${qs}` : pathname, { replace });
  };

  // Keep the input in sync when the URL changes elsewhere (e.g. back button / clear).
  useEffect(() => {
    if (q !== lastPushed.current) {
      lastPushed.current = q;
      setSearch(q);
    }
  }, [q]);

  // Debounced search.
  useEffect(() => {
    const value = search.trim();
    if (value === lastPushed.current) return;
    const id = setTimeout(() => {
      lastPushed.current = value;
      update({ q: value || undefined }, true);
    }, 350);
    return () => clearTimeout(id);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [search]);

  const hasFilters = Boolean(q || category || exclude.length || wallet || sort !== DEFAULT_SORT);
  const selectedWallet = wallets.find((w) => w.id === wallet);

  return (
    <div className="flex flex-col gap-2 md:flex-row md:items-center">
      <div className="relative flex-1">
        <Search className="pointer-events-none absolute top-1/2 left-3 size-4 -translate-y-1/2 text-muted-foreground" />
        <Input
          value={search}
          onChange={(e) => setSearch(e.target.value)}
          placeholder="Search by description…"
          aria-label="Search expenses by description"
          className="pl-9"
          maxLength={100}
        />
        {search && (
          <button
            type="button"
            aria-label="Clear search"
            onClick={() => setSearch("")}
            className="absolute top-1/2 right-2 flex size-6 -translate-y-1/2 items-center justify-center rounded-md text-muted-foreground hover:bg-muted hover:text-foreground"
          >
            <X className="size-3.5" />
          </button>
        )}
      </div>
      <div className="grid grid-cols-2 gap-2 md:flex">
        <CategoryFilter
          categories={categories}
          category={category}
          exclude={exclude}
          onChange={(next) => update({ category: next.category, exclude: next.exclude?.join(",") || undefined })}
        />
        <Select value={wallet ?? ALL} onValueChange={(v) => update({ wallet: v === ALL ? undefined : v })}>
          <SelectTrigger className="w-full md:w-40" aria-label="Filter by wallet">
            <SelectValue>{selectedWallet?.name ?? "All wallets"}</SelectValue>
          </SelectTrigger>
          <SelectContent>
            <SelectItem value={ALL}>All wallets</SelectItem>
            {wallets.map((w) => (
              <SelectItem key={w.id} value={w.id}>
                <span className="size-2 rounded-full" style={{ backgroundColor: w.color }} />
                {w.name}
              </SelectItem>
            ))}
          </SelectContent>
        </Select>
        <Select value={sort} onValueChange={(v) => update({ sort: v === DEFAULT_SORT ? undefined : v })}>
          <SelectTrigger className="col-span-2 w-full md:col-span-1 md:w-40" aria-label="Sort expenses">
            <SelectValue>{SORT_OPTIONS[sort as keyof typeof SORT_OPTIONS] ?? SORT_OPTIONS[DEFAULT_SORT]}</SelectValue>
          </SelectTrigger>
          <SelectContent>
            {Object.entries(SORT_OPTIONS).map(([value, label]) => (
              <SelectItem key={value} value={value}>
                {label}
              </SelectItem>
            ))}
          </SelectContent>
        </Select>
      </div>
      {hasFilters && (
        <Button
          variant="ghost"
          onClick={() => {
            lastPushed.current = "";
            setSearch("");
            update({ q: undefined, category: undefined, exclude: undefined, wallet: undefined, sort: undefined });
          }}
        >
          <X />
          Reset
        </Button>
      )}
    </div>
  );
}
