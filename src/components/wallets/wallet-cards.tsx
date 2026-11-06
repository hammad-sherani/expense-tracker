"use client";

import { Archive, ArchiveRestore, ArrowLeftRight, MoreVertical, Pencil, Plus, Trash2 } from "lucide-react";
import Link from "next/link";
import { useState, useTransition } from "react";
import { toast } from "sonner";
import { Button } from "@/components/ui/button";
import { Card } from "@/components/ui/card";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import { TransferDialog } from "@/components/wallets/transfer-dialog";
import { WalletDialog } from "@/components/wallets/wallet-dialog";
import { formatCurrency } from "@/lib/format";
import { cn } from "@/lib/utils";
import { WALLET_TYPE_META } from "@/lib/wallets";
import { deleteWallet, setWalletArchived } from "@/server/actions/wallets";
import type { WalletDTO } from "@/types";

export function WalletHeaderActions() {
  const [adding, setAdding] = useState(false);
  const [moving, setMoving] = useState(false);
  return (
    <>
      <Button variant="outline" onClick={() => setMoving(true)}>
        <ArrowLeftRight />
        Move money
      </Button>
      <Button onClick={() => setAdding(true)}>
        <Plus />
        Add wallet
      </Button>
      <WalletDialog open={adding} onOpenChange={setAdding} />
      <TransferDialog open={moving} onOpenChange={setMoving} />
    </>
  );
}

export function WalletMenu({ wallet, align = "end" }: { wallet: WalletDTO; align?: "start" | "end" }) {
  const [editing, setEditing] = useState(false);
  const [moving, setMoving] = useState(false);
  const [isPending, startTransition] = useTransition();

  const run = (fn: () => Promise<{ ok: boolean; error?: string; message?: string }>) =>
    startTransition(async () => {
      const r = await fn();
      if (r.ok) toast.success(r.message);
      else toast.error(r.error);
    });

  return (
    <>
      <DropdownMenu>
        <DropdownMenuTrigger asChild>
          <Button variant="ghost" size="icon-sm" aria-label={`Options for ${wallet.name}`} disabled={isPending}>
            <MoreVertical />
          </Button>
        </DropdownMenuTrigger>
        <DropdownMenuContent align={align}>
          <DropdownMenuItem onSelect={() => setEditing(true)}>
            <Pencil />
            Edit
          </DropdownMenuItem>
          {!wallet.archived && (
            <DropdownMenuItem onSelect={() => setMoving(true)}>
              <ArrowLeftRight />
              Move money from here
            </DropdownMenuItem>
          )}
          <DropdownMenuSeparator />
          <DropdownMenuItem onSelect={() => run(() => setWalletArchived(wallet.id, !wallet.archived))}>
            {wallet.archived ? <ArchiveRestore /> : <Archive />}
            {wallet.archived ? "Restore" : "Archive"}
          </DropdownMenuItem>
          <DropdownMenuItem variant="destructive" onSelect={() => run(() => deleteWallet(wallet.id))}>
            <Trash2 />
            Delete
          </DropdownMenuItem>
        </DropdownMenuContent>
      </DropdownMenu>
      <WalletDialog open={editing} onOpenChange={setEditing} wallet={wallet} />
      <TransferDialog open={moving} onOpenChange={setMoving} fromId={wallet.id} />
    </>
  );
}

export function WalletCard({ wallet }: { wallet: WalletDTO }) {
  const meta = WALLET_TYPE_META[wallet.type];
  const Icon = meta.icon;
  return (
    <Card className={cn("relative gap-0 px-5 py-4 transition-colors hover:bg-muted/30", wallet.archived && "opacity-70")}>
      <div className="flex items-start gap-3">
        <span
          className="flex size-10 shrink-0 items-center justify-center rounded-xl"
          style={{ backgroundColor: `${wallet.color}1f`, color: wallet.color }}
          aria-hidden
        >
          <Icon className="size-5" />
        </span>
        <div className="min-w-0 flex-1">
          <Link href={`/wallets/${wallet.id}`} className="block truncate font-medium after:absolute after:inset-0">
            {wallet.name}
          </Link>
          <p className="text-xs text-muted-foreground">{wallet.archived ? "Archived" : meta.label}</p>
        </div>
        <div className="relative z-10">
          <WalletMenu wallet={wallet} />
        </div>
      </div>
      <p
        className={cn(
          "mt-4 text-2xl font-semibold tracking-tight tabular-nums",
          wallet.balance < 0 && "text-destructive",
        )}
      >
        {formatCurrency(wallet.balance)}
      </p>
      <p className="text-xs text-muted-foreground">Current balance</p>
    </Card>
  );
}
