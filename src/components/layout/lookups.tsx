"use client";

import { createContext, use, useEffect, useState } from "react";
import type { CategoryDTO, WalletDTO } from "@/types";

export type GroupOption = { id: string; name: string; emoji: string | null; memberIds: string[] };

export type Lookups = {
  categories: CategoryDTO[];
  wallets: WalletDTO[];
  /** Wallet of the most recent expense, preselected in the form. */
  lastWalletId: string | null;
  /** Active groups/trips. */
  groups: GroupOption[];
  /** Recurring bills due today or overdue. */
  dueBills: number;
};

type Ctx = Lookups & { ready: boolean; set: (data: Lookups) => void };

const EMPTY: Lookups = { categories: [], wallets: [], lastWalletId: null, groups: [], dueBills: 0 };
const LookupsContext = createContext<Ctx>({ ...EMPTY, ready: false, set: () => {} });

/**
 * The signed-in user's categories and wallets for client forms (quick add lives
 * in the layout, outside any page). Filled by <LookupsSync> from the server and
 * refreshed automatically after every mutation, since actions refresh the layout.
 */
export function LookupsProvider({ children }: { children: React.ReactNode }) {
  const [data, setData] = useState<Lookups | null>(null);
  return (
    <LookupsContext value={{ ...(data ?? EMPTY), ready: data !== null, set: setData }}>{children}</LookupsContext>
  );
}

export function LookupsSync({ data }: { data: Lookups }) {
  const { set } = use(LookupsContext);
  useEffect(() => set(data), [data, set]);
  return null;
}

export function useLookups() {
  return use(LookupsContext);
}
