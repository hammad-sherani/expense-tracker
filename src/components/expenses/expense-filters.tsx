"use client";

import { Search, X } from "lucide-react";
import { usePathname, useSearchParams } from "next/navigation";
import { useEffect, useRef, useState } from "react";
import { useNavigationTransition } from "@/components/shared/navigation-transition";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { categoryIcon } from "@/lib/category-icons";
import { DEFAULT_SORT, SORT_OPTIONS } from "@/lib/constants";
import type { CategoryDTO, WalletDTO } from "@/types";

const ALL = "__all__";

export function ExpenseFilters({
  q,
  category,
  wallet,
  sort,
  categories,
  wallets,
}: {
  q: string;
  category?: string;
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

  const hasFilters = Boolean(q || category || wallet || sort !== DEFAULT_SORT);
  const selectedCategory = categories.find((c) => c.id === category);
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
        <Select value={category ?? ALL} onValueChange={(v) => update({ category: v === ALL ? undefined : v })}>
          <SelectTrigger className="w-full md:w-44" aria-label="Filter by category">
            <SelectValue>{selectedCategory?.name ?? "All categories"}</SelectValue>
          </SelectTrigger>
          <SelectContent>
            <SelectItem value={ALL}>All categories</SelectItem>
            {categories.map((c) => {
              const Icon = categoryIcon(c.icon);
              return (
                <SelectItem key={c.id} value={c.id}>
                  <Icon style={{ color: c.color }} />
                  {c.name}
                  {c.archived && <span className="text-xs text-muted-foreground">(archived)</span>}
                </SelectItem>
              );
            })}
          </SelectContent>
        </Select>
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
            update({ q: undefined, category: undefined, wallet: undefined, sort: undefined });
          }}
        >
          <X />
          Reset
        </Button>
      )}
    </div>
  );
}
