"use client";

import { Ban, Loader2, MailPlus, ShieldCheck, Trash2 } from "lucide-react";
import { useRouter } from "next/navigation";
import { useState, useTransition } from "react";
import { Bar, BarChart, CartesianGrid, ResponsiveContainer, Tooltip, XAxis, YAxis } from "recharts";
import { toast } from "sonner";
import {
  AlertDialog,
  AlertDialogAction,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
} from "@/components/ui/alert-dialog";
import { Button } from "@/components/ui/button";
import { deleteUserAccount, resendUserVerification, setUserBlocked } from "@/server/actions/admin";
import type { SignupPoint } from "@/server/queries/admin";

/** New signups per day, last 30 days (one series, so no legend). */
export function SignupsChart({ data }: { data: SignupPoint[] }) {
  return (
    <div className="h-56">
      <ResponsiveContainer width="100%" height="100%">
        <BarChart data={data} margin={{ top: 8, right: 8, left: 0, bottom: 0 }} barCategoryGap="20%">
          <CartesianGrid vertical={false} stroke="var(--border)" />
          <XAxis
            dataKey="label"
            tickLine={false}
            axisLine={false}
            tickMargin={8}
            interval={4}
            tick={{ fill: "var(--muted-foreground)", fontSize: 12 }}
          />
          <YAxis
            allowDecimals={false}
            tickLine={false}
            axisLine={false}
            width={32}
            tick={{ fill: "var(--muted-foreground)", fontSize: 12 }}
          />
          <Tooltip
            cursor={{ fill: "var(--muted)", opacity: 0.6 }}
            content={({ active, payload }) => {
              if (!active || !payload?.length) return null;
              const p = payload[0].payload as SignupPoint;
              return (
                <div className="rounded-lg border bg-popover px-3 py-2 text-xs shadow-md">
                  <p className="font-medium">{p.label}</p>
                  <p className="text-muted-foreground">
                    {p.count} signup{p.count === 1 ? "" : "s"}
                  </p>
                </div>
              );
            }}
          />
          <Bar dataKey="count" fill="var(--chart-1)" radius={[4, 4, 0, 0]} maxBarSize={18} />
        </BarChart>
      </ResponsiveContainer>
    </div>
  );
}

export function UserActions({
  id,
  username,
  verified,
  blocked,
}: {
  id: string;
  username: string;
  verified: boolean;
  blocked: boolean;
}) {
  const [isPending, startTransition] = useTransition();
  const [confirm, setConfirm] = useState<"block" | "delete" | null>(null);
  const router = useRouter();
  const run = (fn: () => Promise<{ ok: boolean; error?: string; message?: string }>, after?: () => void) =>
    startTransition(async () => {
      const r = await fn();
      if (r.ok) {
        toast.success(r.message);
        after?.();
      } else toast.error(r.error);
      setConfirm(null);
    });

  return (
    <div className="flex flex-wrap gap-2">
      {blocked ? (
        <Button variant="outline" disabled={isPending} onClick={() => run(() => setUserBlocked(id, false))}>
          {isPending ? <Loader2 className="animate-spin" /> : <ShieldCheck />}
          Unblock
        </Button>
      ) : (
        <Button variant="outline" disabled={isPending} onClick={() => setConfirm("block")}>
          <Ban />
          Block
        </Button>
      )}
      {!verified && (
        <Button variant="outline" disabled={isPending} onClick={() => run(() => resendUserVerification(id))}>
          <MailPlus />
          Resend verification
        </Button>
      )}
      <Button variant="destructive" disabled={isPending} onClick={() => setConfirm("delete")}>
        <Trash2 />
        Delete account
      </Button>

      <AlertDialog open={confirm !== null} onOpenChange={(o) => !o && !isPending && setConfirm(null)}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>{confirm === "block" ? `Block ${username}?` : `Delete ${username}'s account?`}</AlertDialogTitle>
            <AlertDialogDescription>
              {confirm === "block"
                ? "They'll be logged out on every device and won't be able to log in until you unblock them. Their data is kept."
                : "This permanently deletes the account and all of its data. It can't be undone."}
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel disabled={isPending}>Cancel</AlertDialogCancel>
            <AlertDialogAction
              variant="destructive"
              disabled={isPending}
              onClick={(e) => {
                e.preventDefault();
                if (confirm === "block") run(() => setUserBlocked(id, true));
                else run(() => deleteUserAccount(id), () => router.push("/admin/users"));
              }}
            >
              {isPending && <Loader2 className="animate-spin" />}
              {confirm === "block" ? "Block" : "Delete forever"}
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </div>
  );
}
