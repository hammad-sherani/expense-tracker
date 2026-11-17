"use client";

import { Loader2, Trash2 } from "lucide-react";
import { useTransition } from "react";
import { toast } from "sonner";
import { Button } from "@/components/ui/button";
import { deleteAdjustment, deleteTransfer } from "@/server/actions/wallets";

/** Removes a transfer or a balance adjustment from a wallet's history. */
export function RemoveTransferButton({ id, kind = "transfer" }: { id: string; kind?: "transfer" | "adjustment" }) {
  const [isPending, startTransition] = useTransition();
  return (
    <Button
      variant="ghost"
      size="icon-sm"
      aria-label={kind === "transfer" ? "Remove transfer" : "Remove adjustment"}
      className="text-muted-foreground hover:text-destructive"
      disabled={isPending}
      onClick={() =>
        startTransition(async () => {
          const r = await (kind === "transfer" ? deleteTransfer(id) : deleteAdjustment(id));
          if (r.ok) toast.success(r.message);
          else toast.error(r.error);
        })
      }
    >
      {isPending ? <Loader2 className="animate-spin" /> : <Trash2 />}
    </Button>
  );
}
